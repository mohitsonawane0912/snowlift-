import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  VEHICLE_CATALOG,
  VehicleUpgradeLevels,
  calculateEffectiveStats,
  ObstacleBox,
  ObstacleCircle,
  resolveCircleBoxCollision,
  resolveCircleCircleCollision,
  WeatherStage,
  WeatherConfig,
  WEATHER_CONFIGS,
  getNextWeatherStage,
  calculateSnowAccumulationCount,
  checkHighwayCheckpointWarning,
} from './rules.ts';
import { sound } from '../audio/synth.ts';

const _vec3A = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();

export interface GameSceneCallbacks {
  onSnowPlowed: (volume: number, x: number, z: number) => void;
  onTreasureFound: (type: 'bell' | 'cocoa' | 'mittens' | 'firewood', x: number, z: number) => void;
  onPorchShoveled: (cabinIndex: number) => void;
  onRoofRaked: (cabinIndex: number) => void;
  onCrash: () => void;
  onMunicipalFine: (amount: number, reason: string) => void;
  onWeatherChange: (stage: WeatherStage, config: WeatherConfig) => void;
  onCheckpointWarning: (message: string) => void;
  onClearanceUpdate: (percent: number) => void;
  onSpeedUpdate: (speedKmH: number) => void;
  onBoostUpdate: (remainingRatio: number) => void;
  onSaltRemainingUpdate: (remainingRatio: number) => void;
  onModeChange: (mode: 'vehicle' | 'foot') => void;
  onNearVehicleChange: (near: boolean) => void;
  onNearWorkOrderChange: (prompt: string | null) => void;
}

export interface TownTreasure {
  id: string;
  type: 'bell' | 'cocoa' | 'mittens' | 'firewood';
  x: number;
  z: number;
  found: boolean;
  mesh: THREE.Group;
}

export interface CabinWorkSite {
  index: number;
  x: number;
  z: number;
  porchCleared: boolean;
  roofCleared: boolean;
  porchMarker: THREE.Group;
  roofSnowMesh: THREE.Mesh;
}

export interface TownCitizen {
  id: string;
  name: string;
  group: THREE.Group;
  x: number;
  z: number;
  heading: number;
  speed: number;
  waypoints: { x: number; z: number }[];
  currentWaypointIdx: number;
  walkCycle: number;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  isStartled: boolean;
  startledTimer: number;
  fineCooldown: number;
}

export class SnowGameWorld {
  public container: HTMLElement;
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;

  public isSoftwareGl: boolean = false;
  private animFrameId: number = 0;
  private destroyed: boolean = false;

  // Control Mode: 'vehicle' or 'foot'
  public controlMode: 'vehicle' | 'foot' = 'vehicle';

  // Vehicle state
  public activeVehicleId: string = 'cub-cadet';
  public vehicleGroup: THREE.Group = new THREE.Group();
  public vehiclePosition: THREE.Vector3 = new THREE.Vector3(0, 0.4, 6);
  public vehicleHeading: number = Math.PI; // Faces north into town center
  public vehicleVelocity: number = 0;
  public steeringAngle: number = 0;
  public isBoosting: boolean = false;
  public boostCharge: number = 1.0;
  public saltActive: boolean = false;
  public saltRemaining: number = 1.0;

  // Realism: Realistic Twin Vehicle Headlights
  private leftHeadlight!: THREE.SpotLight;
  private rightHeadlight!: THREE.SpotLight;
  private headlightTarget: THREE.Object3D = new THREE.Object3D();

  // On-Foot Player Character state
  public characterGroup: THREE.Group = new THREE.Group();
  public characterPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public characterHeading: number = 0;
  public characterVelocity: THREE.Vector3 = new THREE.Vector3();
  private characterWalkTime: number = 0;
  private shovelMesh: THREE.Mesh | null = null;
  private isShoveling: boolean = false;
  private shovelAnimTime: number = 0;

  // Obstacles for Solid Collision Detection
  private cabinBoxes: ObstacleBox[] = [];
  private treeCircles: ObstacleCircle[] = [];
  private lampCircles: ObstacleCircle[] = [];
  private barrierBoxes: ObstacleBox[] = [];

  // Cabin Interactive Work Orders
  private cabinWorkSites: CabinWorkSite[] = [];

  // Townsfolk / Citizens (MCPs)
  private citizens: TownCitizen[] = [];

  // Dynamic Snowfall & Weather Intensity System
  public currentWeatherStage: WeatherStage = 'flurry';
  public weatherTimer: number = 0;
  public snowAccumulator: number = 0;
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private currentFogNear: number = 25;
  private currentFogFar: number = 95;
  private currentFogColor: THREE.Color = new THREE.Color(0x94a3b8);

  // Continuous Ambient Snowfall Particle Field
  private readonly AMBIENT_FLAKES_COUNT = 900;
  private ambientFlakesPoints!: THREE.Points;
  private ambientFlakesGeom!: THREE.BufferGeometry;
  private ambientFlakesPos!: Float32Array;
  private ambientFlakesVel!: Float32Array;

  // Chimneys & Smoke Puffs
  private chimneySmokeEmitters: THREE.Vector3[] = [];
  private chimneyParticles: { mesh: THREE.Mesh; life: number; maxLife: number; vel: THREE.Vector3 }[] = [];

  // Vehicle parts references
  private wheels: THREE.Mesh[] = [];
  private beaconLight: THREE.Mesh | null = null;
  private saltSpinner: THREE.Mesh | null = null;
  private plowBladeGroup: THREE.Group | null = null;
  private exhaustEmitters: THREE.Vector3[] = [];
  private steamParticles: { mesh: THREE.Mesh; life: number; maxLife: number; vel: THREE.Vector3 }[] = [];

  // Snow Particle Spray Pool
  private snowParticles: {
    mesh: THREE.Mesh;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    life: number;
    maxLife: number;
    active: boolean;
  }[] = [];
  private snowParticleGroup: THREE.Group = new THREE.Group();

  public readonly ARENA_SIZE = 120;
  public readonly GRID_RES = 120;
  public snowGrid: Float32Array = new Float32Array(120 * 120);
  public roadMask: Uint8Array = new Uint8Array(120 * 120);
  public totalPlowableCells: number = 0;
  public clearedPlowableCells: number = 0;

  // Snow instance tracking for dynamic re-accumulation
  private snowInstancedMesh!: THREE.InstancedMesh;
  public clearedCellIndices: number[] = [];
  public cellToInstMap: Int32Array = new Int32Array(120 * 120).fill(-1);
  public instCoords: { x: number; z: number }[] = [];

  private roadMeshGroup: THREE.Group = new THREE.Group();
  private treasures: TownTreasure[] = [];

  // Highway Checkpoint Warning Cooldown
  private lastCheckpointWarningTime: number = 0;

  public inputs = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    boost: false,
    salt: false,
    action: false, // Shovel / Rake
  };

  public upgrades: VehicleUpgradeLevels = {
    engineLevel: 0,
    bladeLevel: 0,
    saltLevel: 0,
    boostLevel: 0,
  };
  public callbacks: GameSceneCallbacks;

  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  private isTitleFlyover: boolean = true;
  private titleFlyoverAngle: number = 0;

  constructor(container: HTMLElement, callbacks: GameSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.initGL();
    this.initScene();
    this.buildTownEnvironment();
    this.buildHighwayCheckpoints();
    this.buildRoadsAndSnow();
    this.buildVehicle(this.activeVehicleId);
    this.buildPlayerCharacter();
    this.buildTownCitizens();
    this.initParticlePools();
    this.initAmbientSnowfall();
    this.setupWindowResize();
    this.startLoop();

    // Initial weather notify
    this.callbacks.onWeatherChange(this.currentWeatherStage, WEATHER_CONFIGS[this.currentWeatherStage]);
    (window as unknown as { snowWorld: SnowGameWorld }).snowWorld = this;
  }

  private initGL() {
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
  }

  private initScene() {
    this.scene = new THREE.Scene();
    const initCfg = WEATHER_CONFIGS[this.currentWeatherStage];
    this.scene.background = new THREE.Color(initCfg.fogColor);
    this.scene.fog = new THREE.Fog(initCfg.fogColor, initCfg.fogNear, initCfg.fogFar);
    this.currentFogNear = initCfg.fogNear;
    this.currentFogFar = initCfg.fogFar;
    this.currentFogColor.setHex(initCfg.fogColor);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.5, 250);
    this.camera.position.set(0, 32, 38);
    this.camera.lookAt(0, 0, 0);

    this.dirLight = new THREE.DirectionalLight(0xfff5e6, initCfg.sunIntensity);
    this.dirLight.position.set(30, 48, 25);
    this.dirLight.castShadow = !this.isSoftwareGl;
    if (this.dirLight.castShadow) {
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.camera.near = 10;
      this.dirLight.shadow.camera.far = 130;
      const d = 42;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.bias = -0.0005;
      this.dirLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0xecf8ff, 0x94abbd, initCfg.ambientIntensity);
    this.scene.add(this.hemiLight);

    this.scene.add(this.vehicleGroup);
    this.scene.add(this.characterGroup);
    this.scene.add(this.snowParticleGroup);

    // Setup Headlight target
    this.scene.add(this.headlightTarget);
  }

  /**
   * Ambient continuous snowfall particle system
   */
  private initAmbientSnowfall() {
    this.ambientFlakesGeom = new THREE.BufferGeometry();
    this.ambientFlakesPos = new Float32Array(this.AMBIENT_FLAKES_COUNT * 3);
    this.ambientFlakesVel = new Float32Array(this.AMBIENT_FLAKES_COUNT * 3);

    for (let i = 0; i < this.AMBIENT_FLAKES_COUNT; i++) {
      this.ambientFlakesPos[i * 3 + 0] = (Math.random() - 0.5) * 110;
      this.ambientFlakesPos[i * 3 + 1] = Math.random() * 28 + 0.2;
      this.ambientFlakesPos[i * 3 + 2] = (Math.random() - 0.5) * 110;

      this.ambientFlakesVel[i * 3 + 0] = (Math.random() - 0.5) * 2;
      this.ambientFlakesVel[i * 3 + 1] = -(4.0 + Math.random() * 5.0);
      this.ambientFlakesVel[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }

    this.ambientFlakesGeom.setAttribute('position', new THREE.BufferAttribute(this.ambientFlakesPos, 3));

    const flakeMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: this.isSoftwareGl ? 0.35 : 0.45,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    this.ambientFlakesPoints = new THREE.Points(this.ambientFlakesGeom, flakeMat);
    this.scene.add(this.ambientFlakesPoints);
  }

  /**
   * Build On-Foot Player Character model (parka, beanie, boots, shovel)
   */
  private buildPlayerCharacter() {
    this.characterGroup.visible = false; // Hidden until player exits truck

    // 1. Torso: Puffy Orange Winter Parka
    const parkaGeo = new THREE.CapsuleGeometry(0.32, 0.55, 4, 8);
    const parkaMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
    const torso = new THREE.Mesh(parkaGeo, parkaMat);
    torso.position.y = 0.75;
    torso.castShadow = !this.isSoftwareGl;
    this.characterGroup.add(torso);

    // Fur trim collar
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.08, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 })
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.05;
    this.characterGroup.add(collar);

    // 2. Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.5 })
    );
    head.position.y = 1.25;
    this.characterGroup.add(head);

    // 3. Knit Beanie Hat
    const beanie = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.8 })
    );
    beanie.position.y = 1.35;
    const pompom = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    );
    pompom.position.y = 1.62;
    this.characterGroup.add(beanie, pompom);

    // 4. Legs / Boots
    [-0.14, 0.14].forEach((x) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 0.45, 6),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
      );
      leg.position.set(x, 0.22, 0);
      leg.castShadow = !this.isSoftwareGl;
      this.characterGroup.add(leg);
    });

    // 5. Metal Snow Shovel
    const shovelGroup = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
    );
    pole.rotation.z = -0.3;
    const scoop = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.38, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 })
    );
    scoop.position.set(0.28, -0.45, 0.1);
    scoop.rotation.x = 0.25;
    shovelGroup.add(pole, scoop);
    shovelGroup.position.set(0.3, 0.7, 0.2);
    this.characterGroup.add(shovelGroup);
    this.shovelMesh = scoop;

    // Contact shadow
    const charShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 12),
      new THREE.MeshBasicMaterial({ color: 0x090d16, transparent: true, opacity: 0.35, depthWrite: false })
    );
    charShadow.rotateX(-Math.PI / 2);
    charShadow.position.y = 0.02;
    this.characterGroup.add(charShadow);
  }

  /**
   * Build Pedestrian Citizens (MCPs/Townsfolk) patrolling sidewalks and crosswalks
   */
  private buildTownCitizens() {
    const citizenConfigs = [
      {
        id: 'npc-1',
        name: 'Oliver Vance',
        coatColor: 0xdc2626, // Bright Red Down Jacket
        hatColor: 0x1e3a8a,
        startX: -12,
        startZ: -18,
        speed: 1.8,
        waypoints: [
          { x: -12, z: -18 },
          { x: 0, z: -18 },
          { x: 12, z: -18 },
          { x: 12, z: -8 },
          { x: -12, z: -8 },
        ],
      },
      {
        id: 'npc-2',
        name: 'Evelyn Brooks',
        coatColor: 0x0284c7, // Cobalt Blue Coat
        hatColor: 0xfef08a,
        startX: 18,
        startZ: -12,
        speed: 2.1,
        waypoints: [
          { x: 18, z: -12 },
          { x: 18, z: 0 },
          { x: 18, z: 14 },
          { x: 8, z: 14 },
          { x: 8, z: -12 },
        ],
      },
      {
        id: 'npc-3',
        name: 'Lucas Sterling',
        coatColor: 0xeab308, // Mustard Ski Parka
        hatColor: 0x0f172a,
        startX: -18,
        startZ: 14,
        speed: 1.9,
        waypoints: [
          { x: -18, z: 14 },
          { x: -18, z: 0 },
          { x: -18, z: -14 },
          { x: -8, z: -14 },
          { x: -8, z: 14 },
        ],
      },
      {
        id: 'npc-4',
        name: 'Maya Lin',
        coatColor: 0x9333ea, // Cozy Purple Puffer
        hatColor: 0xf43f5e,
        startX: -6,
        startZ: 18,
        speed: 2.0,
        waypoints: [
          { x: -6, z: 18 },
          { x: 6, z: 18 },
          { x: 6, z: 6 },
          { x: -6, z: 6 },
        ],
      },
      {
        id: 'npc-5',
        name: 'Arthur Miller',
        coatColor: 0x15803d, // Dark Pine Coat
        hatColor: 0x475569,
        startX: 0,
        startZ: 28,
        speed: 1.5,
        waypoints: [
          { x: 0, z: 28 },
          { x: 14, z: 28 },
          { x: 14, z: 20 },
          { x: 0, z: 20 },
        ],
      },
    ];

    citizenConfigs.forEach((cfg) => {
      const group = new THREE.Group();

      // Torso Parka
      const coatMat = new THREE.MeshStandardMaterial({ color: cfg.coatColor, roughness: 0.6 });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 8), coatMat);
      torso.position.y = 0.7;
      torso.castShadow = !this.isSoftwareGl;
      group.add(torso);

      // Scarf / Collar
      const scarf = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.07, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })
      );
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = 0.98;
      group.add(scarf);

      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.5 })
      );
      head.position.y = 1.18;
      group.add(head);

      // Beanie Hat
      const beanie = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: cfg.hatColor, roughness: 0.8 })
      );
      beanie.position.y = 1.26;
      const pompom = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
      );
      pompom.position.y = 1.5;
      group.add(beanie, pompom);

      // Legs / Boots (animatable)
      const legs: THREE.Mesh[] = [];
      [-0.12, 0.12].forEach((lx) => {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.1, 0.42, 6),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
        );
        leg.position.set(lx, 0.21, 0);
        group.add(leg);
        legs.push(leg);
      });

      // Arms
      const arms: THREE.Mesh[] = [];
      [-0.28, 0.28].forEach((ax) => {
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.08, 0.42, 6),
          coatMat
        );
        arm.position.set(ax, 0.65, 0);
        group.add(arm);
        arms.push(arm);
      });

      // Contact shadow
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.35, 12),
        new THREE.MeshBasicMaterial({ color: 0x090d16, transparent: true, opacity: 0.35, depthWrite: false })
      );
      shadow.rotateX(-Math.PI / 2);
      shadow.position.y = 0.02;
      group.add(shadow);

      group.position.set(cfg.startX, 0, cfg.startZ);
      this.scene.add(group);

      this.citizens.push({
        id: cfg.id,
        name: cfg.name,
        group,
        x: cfg.startX,
        z: cfg.startZ,
        heading: 0,
        speed: cfg.speed,
        waypoints: cfg.waypoints,
        currentWaypointIdx: 0,
        walkCycle: Math.random() * Math.PI * 2,
        legs,
        arms,
        isStartled: false,
        startledTimer: 0,
        fineCooldown: 0,
      });
    });
  }

  /**
   * Builds realistic city highway entry/exit checkpoints (no ugly perimeter wall slabs!)
   */
  private buildHighwayCheckpoints() {
    // 1. North Mountain Pass Checkpoint at (0, -56)
    this.createCheckpointStructure({
      x: 0,
      z: -56,
      heading: 0,
      name: 'HIGHWAY 9 NORTH PASS',
      statusText: 'CLOSED: AVALANCHE DANGER',
      signSubtext: 'AUTHORIZED MUNICIPAL FLEET ONLY',
    });

    // 2. South Valley Expressway Checkpoint at (0, 56)
    this.createCheckpointStructure({
      x: 0,
      z: 56,
      heading: Math.PI,
      name: 'VALLEY EXPRESSWAY TOLL',
      statusText: 'MUNICIPAL ZONE BOUNDARY',
      signSubtext: 'CONTRACT SECTOR ENDS HERE',
    });

    // Natural Pine Forest Treelines and Rolling Snow Berms framing East and West flanks
    this.createNaturalMountainFlanks();
  }

  private createCheckpointStructure(opt: {
    x: number;
    z: number;
    heading: number;
    name: string;
    statusText: string;
    signSubtext: string;
  }) {
    const group = new THREE.Group();
    group.position.set(opt.x, 0, opt.z);
    group.rotation.y = opt.heading;

    // Concrete Toll Island (dividing lanes)
    const islandGeo = new THREE.BoxGeometry(2.4, 0.45, 10);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(0, 0.22, 0);
    group.add(island);

    // Hazard Stripes on Island Curbs
    const stripeGeo = new THREE.BoxGeometry(2.45, 0.46, 0.8);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.4,
      emissive: 0x854d0e,
      emissiveIntensity: 0.4,
    });
    for (let s = -4; s <= 4; s += 2) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 0.23, s);
      group.add(stripe);
    }

    // Tollbooth Station Cabin
    const boothGeo = new THREE.BoxGeometry(2.2, 3.2, 3.2);
    const boothMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const booth = new THREE.Mesh(boothGeo, boothMat);
    booth.position.set(0, 1.8, 0);
    group.add(booth);

    // Booth Warm Glowing Windows
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    [-1.15, 1.15].forEach((wx) => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 2.0), winMat);
      win.position.set(wx, 2.1, 0);
      group.add(win);
    });

    // Booth Snow-Covered Cedar Roof
    const boothRoofGeo = new THREE.ConeGeometry(2.6, 1.4, 4);
    boothRoofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(boothRoofGeo, new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }));
    roof.position.set(0, 4.1, 0);
    const snowCap = new THREE.Mesh(
      new THREE.ConeGeometry(2.7, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    );
    snowCap.rotateY(Math.PI / 4);
    snowCap.position.set(0, 4.25, 0);
    group.add(roof, snowCap);

    // Overhead Steel Cantilever Gantry Truss
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    // Left & Right Pillars
    [-8.5, 8.5].forEach((px) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6.5, 8), gantryMat);
      pillar.position.set(px, 3.25, 0);
      group.add(pillar);
    });
    // Cross Beam
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(18.5, 0.6, 0.8), gantryMat);
    crossBeam.position.set(0, 6.2, 0);
    group.add(crossBeam);

    // Large Electronic LED DOT Highway Matrix Sign
    const signBoardGeo = new THREE.BoxGeometry(14.0, 1.8, 0.4);
    const signBoardMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 });
    const signBoard = new THREE.Mesh(signBoardGeo, signBoardMat);
    signBoard.position.set(0, 5.0, 0);
    group.add(signBoard);

    // Glowing LED Text Display (Simulated with illuminated amber matrix bars)
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.8,
      roughness: 0.2,
    });
    const ledBar1 = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.35, 0.45), ledMat);
    ledBar1.position.set(0, 5.4, 0.05);
    const ledBar2 = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.35, 0.45), ledMat);
    ledBar2.position.set(0, 4.6, 0.05);
    group.add(ledBar1, ledBar2);

    // Flashing Amber Hazard Beacons on Gantry
    [-6.5, 6.5].forEach((bx) => {
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 3.5,
        })
      );
      beacon.position.set(bx, 6.7, 0);
      group.add(beacon);
    });

    // Hydraulic Striped Boom Barrier Arms (Left & Right Lanes)
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });
    [-4.5, 4.5].forEach((bx) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.22, 0.22), barrierMat);
      arm.position.set(bx, 1.1, 0);
      group.add(arm);

      // Warning red beacon on barrier arm
      const blinker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 3.0,
        })
      );
      blinker.position.set(bx, 1.3, 0);
      group.add(blinker);
    });

    // Highway Corrugated Metal Guardrails on shoulders
    const guardrailMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
    [-8.2, 8.2].forEach((gx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 12), guardrailMat);
      rail.position.set(gx, 0.8, 0);
      group.add(rail);

      for (let gz = -5; gz <= 5; gz += 2.5) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), guardrailMat);
        post.position.set(gx, 0.45, gz);
        group.add(post);
      }
    });

    this.scene.add(group);

    // Register solid obstacle boxes for the boom barriers and toll island to prevent driving off
    const worldZ = opt.z;
    this.barrierBoxes.push({
      minX: opt.x - 9.5,
      maxX: opt.x + 9.5,
      minZ: worldZ - 1.5,
      maxZ: worldZ + 1.5,
    });
  }

  /**
   * Natural Mountain Slopes & Evergreen Pine Treeline framing East and West flanks
   */
  private createNaturalMountainFlanks() {
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.92 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 });

    // East & West Rolling Snow Berms
    [-58, 58].forEach((bx) => {
      for (let z = -55; z <= 55; z += 18) {
        const berm = new THREE.Mesh(new THREE.ConeGeometry(10, 4.5, 7), snowMat);
        berm.scale.set(1.4, 0.8, 1.4);
        berm.position.set(bx + (Math.random() - 0.5) * 4, 1.8, z + (Math.random() - 0.5) * 4);
        this.scene.add(berm);

        // Dense evergreen fir trees along border
        const tree = this.createPineTree();
        tree.position.set(bx + (Math.random() - 0.5) * 5, 0, z + (Math.random() - 0.5) * 6);
        const scale = 1.1 + Math.random() * 0.5;
        tree.scale.set(scale, scale, scale);
        this.scene.add(tree);

        this.treeCircles.push({
          x: tree.position.x,
          z: tree.position.z,
          radius: 0.9 * scale,
        });

        // Split-rail timber fence section
        const fence = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 16), woodMat);
        fence.position.set(bx > 0 ? 52 : -52, 0.45, z);
        this.scene.add(fence);
      }
    });
  }

  private buildTownEnvironment() {
    const groundGeo = new THREE.PlaneGeometry(240, 240, 32, 32);
    groundGeo.rotateX(-Math.PI / 2);

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 128;
    bumpCanvas.height = 128;
    const ctx = bumpCanvas.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = Math.random() * 3 + 1;
      ctx.fillStyle = Math.random() > 0.5 ? '#909090' : '#707070';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const snowBumpMap = new THREE.CanvasTexture(bumpCanvas);
    snowBumpMap.wrapS = THREE.RepeatWrapping;
    snowBumpMap.wrapT = THREE.RepeatWrapping;
    snowBumpMap.repeat.set(24, 24);

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf5f9fd,
      roughness: 0.85,
      metalness: 0.05,
      bumpMap: snowBumpMap,
      bumpScale: 0.08,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.receiveShadow = !this.isSoftwareGl;
    groundMesh.position.y = -0.05;
    this.scene.add(groundMesh);

    // Frozen Canal / Lake
    const iceGeo = new THREE.PlaneGeometry(16, 120);
    iceGeo.rotateX(-Math.PI / 2);
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.9,
    });
    const iceMesh = new THREE.Mesh(iceGeo, iceMat);
    iceMesh.position.set(40, -0.02, 0);
    this.scene.add(iceMesh);

    // Town Cabins with interactive work sites (porches & roofs)
    const cabinSpots = [
      { x: -18, z: -26, rot: 0 },
      { x: 18, z: -26, rot: 0 },
      { x: -32, z: -10, rot: Math.PI / 2 },
      { x: -32, z: 10, rot: Math.PI / 2 },
      { x: -18, z: 26, rot: Math.PI },
      { x: 18, z: 26, rot: Math.PI },
      { x: 30, z: -20, rot: -Math.PI / 2 },
      { x: 30, z: 20, rot: -Math.PI / 2 },
    ];

    cabinSpots.forEach((spot, idx) => {
      const { cabinGroup, roofSnowMesh, porchMarker } = this.createCabinMesh();
      cabinGroup.position.set(spot.x, 0, spot.z);
      cabinGroup.rotation.y = spot.rot;
      this.scene.add(cabinGroup);

      // Register solid obstacle box for house body
      const halfW = 4.2;
      const halfD = 3.6;
      this.cabinBoxes.push({
        minX: spot.x - halfW,
        maxX: spot.x + halfW,
        minZ: spot.z - halfD,
        maxZ: spot.z + halfD,
      });

      // Register interactive work site
      this.cabinWorkSites.push({
        index: idx,
        x: spot.x,
        z: spot.z,
        porchCleared: false,
        roofCleared: false,
        porchMarker,
        roofSnowMesh,
      });

      // Register Chimney Smoke Emitter
      this.chimneySmokeEmitters.push(new THREE.Vector3(spot.x + 2.2, 7.8, spot.z - 1.2));
    });

    // Evergreen Pine Trees
    const treeSpots = [
      { x: -12, z: -35 }, { x: -8, z: -40 }, { x: 12, z: -35 }, { x: 16, z: -42 },
      { x: -28, z: -30 }, { x: -38, z: -22 }, { x: -42, z: -5 }, { x: -42, z: 18 },
      { x: -28, z: 32 }, { x: -14, z: 38 }, { x: 14, z: 38 }, { x: 28, z: 34 },
      { x: 26, z: -32 }, { x: 32, z: -5 }, { x: 35, z: 8 }, { x: 25, z: -8 },
      { x: -8, z: -16 }, { x: 8, z: -16 }, { x: -8, z: 16 }, { x: 8, z: 16 },
    ];

    treeSpots.forEach((spot) => {
      const tree = this.createPineTree();
      tree.position.set(spot.x, 0, spot.z);
      const s = 0.85 + Math.random() * 0.45;
      tree.scale.set(s, s, s);
      this.scene.add(tree);

      this.treeCircles.push({
        x: spot.x,
        z: spot.z,
        radius: 0.75 * s,
      });
    });

    // Street Lamps with warm ground illumination
    const lampSpots = [
      { x: -5, z: -14 }, { x: 5, z: -14 },
      { x: -5, z: 14 }, { x: 5, z: 14 },
      { x: -14, z: -5 }, { x: -14, z: 5 },
      { x: 14, z: -5 }, { x: 14, z: 5 },
      { x: -25, z: 0 }, { x: 25, z: 0 },
      { x: 0, z: -35 }, { x: 0, z: 35 },
    ];

    lampSpots.forEach((spot) => {
      const lamp = this.createStreetLamp();
      lamp.position.set(spot.x, 0, spot.z);
      this.scene.add(lamp);

      this.lampCircles.push({
        x: spot.x,
        z: spot.z,
        radius: 0.45,
      });
    });

    // Village Square & Festive Snowman in the Town Green Park
    const square = this.createVillageSquareCenter();
    square.position.set(-22, 0, 6);
    this.scene.add(square);

    this.lampCircles.push({
      x: -22,
      z: 6,
      radius: 1.6, // Village snowman collision in park
    });
  }

  private createCabinMesh(): { cabinGroup: THREE.Group; roofSnowMesh: THREE.Mesh; porchMarker: THREE.Group } {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(7.2, 4.2, 6.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x5b341e,
      roughness: 0.85,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2.1;
    body.castShadow = !this.isSoftwareGl;
    group.add(body);

    // Front Porch Deck
    const porchDeckGeo = new THREE.BoxGeometry(4.2, 0.4, 2.4);
    const porchMat = new THREE.MeshStandardMaterial({ color: 0x3d2010, roughness: 0.9 });
    const porchDeck = new THREE.Mesh(porchDeckGeo, porchMat);
    porchDeck.position.set(0, 0.2, 4.2);
    porchDeck.receiveShadow = !this.isSoftwareGl;
    group.add(porchDeck);

    // Front Porch Snow Mound (Target for Shoveling)
    const porchMarker = new THREE.Group();
    const porchSnowMoundGeo = new THREE.BoxGeometry(3.6, 0.55, 1.8);
    const porchSnowMoundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const porchSnowMound = new THREE.Mesh(porchSnowMoundGeo, porchSnowMoundMat);
    porchSnowMound.position.set(0, 0.55, 4.2);
    porchSnowMound.castShadow = !this.isSoftwareGl;

    // Glowing target marker
    const markerDisc = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.9, 16),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    markerDisc.rotateX(-Math.PI / 2);
    markerDisc.position.set(0, 0.32, 4.3);
    porchMarker.add(porchSnowMound, markerDisc);
    group.add(porchMarker);

    // Door
    const doorGeo = new THREE.BoxGeometry(1.4, 2.6, 0.2);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 1.3, 3.55);
    group.add(door);

    // Warm Windows
    const windowGeo = new THREE.BoxGeometry(1.6, 1.4, 0.2);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.8,
      roughness: 0.3,
    });
    const winL = new THREE.Mesh(windowGeo, glowMat);
    winL.position.set(-2.4, 2.3, 3.55);
    const winR = new THREE.Mesh(windowGeo, glowMat);
    winR.position.set(2.4, 2.3, 3.55);
    group.add(winL, winR);

    // Roof
    const roofGeo = new THREE.ConeGeometry(6.4, 3.4, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3f1d0b, roughness: 0.75 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 5.6;
    roof.scale.set(1.1, 1, 0.95);
    roof.castShadow = !this.isSoftwareGl;
    group.add(roof);

    // Rooftop Snow Blanket (Clearing Work Order Target)
    const snowRoofGeo = new THREE.ConeGeometry(6.6, 3.3, 4);
    snowRoofGeo.rotateY(Math.PI / 4);
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const roofSnowMesh = new THREE.Mesh(snowRoofGeo, snowMat);
    roofSnowMesh.position.y = 5.8;
    roofSnowMesh.scale.set(1.12, 1, 0.97);
    roofSnowMesh.castShadow = !this.isSoftwareGl;
    group.add(roofSnowMesh);

    // Ladder attached to side of cabin to access roof rake zone
    const ladderGroup = new THREE.Group();
    [-0.3, 0.3].forEach((lx) => {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 4.4, 6),
        new THREE.MeshStandardMaterial({ color: 0x334155 })
      );
      rail.position.set(lx, 2.2, 0);
      ladderGroup.add(rail);
    });
    for (let r = 0; r < 6; r++) {
      const rung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x334155 })
      );
      rung.rotateZ(Math.PI / 2);
      rung.position.set(0, 0.6 + r * 0.6, 0);
      ladderGroup.add(rung);
    }
    ladderGroup.position.set(-4.15, 0, 0);
    ladderGroup.rotation.y = Math.PI / 2;
    group.add(ladderGroup);

    // Chimney
    const chimGeo = new THREE.BoxGeometry(1.0, 3.2, 1.0);
    const chimMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
    const chimney = new THREE.Mesh(chimGeo, chimMat);
    chimney.position.set(2.2, 6.2, -1.2);
    chimney.castShadow = !this.isSoftwareGl;
    group.add(chimney);

    const shadowGeo = new THREE.PlaneGeometry(10, 9);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = 0.01;
    group.add(shadowMesh);

    return { cabinGroup: group, roofSnowMesh, porchMarker };
  }

  private createPineTree(): THREE.Group {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 2.2, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = !this.isSoftwareGl;
    group.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.8 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

    const tiers = [
      { y: 2.5, r: 2.8, h: 2.5 },
      { y: 4.2, r: 2.1, h: 2.3 },
      { y: 5.7, r: 1.4, h: 2.0 },
    ];

    tiers.forEach((tier) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(tier.r, tier.h, 7), foliageMat);
      cone.position.y = tier.y;
      cone.castShadow = !this.isSoftwareGl;

      const snowCap = new THREE.Mesh(new THREE.ConeGeometry(tier.r * 1.04, tier.h * 0.4, 7), snowMat);
      snowCap.position.y = tier.y + tier.h * 0.28;
      snowCap.castShadow = !this.isSoftwareGl;

      group.add(cone, snowCap);
    });

    return group;
  }

  private createStreetLamp(): THREE.Group {
    const group = new THREE.Group();
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });

    const postGeo = new THREE.CylinderGeometry(0.1, 0.14, 4.2, 8);
    const post = new THREE.Mesh(postGeo, ironMat);
    post.position.y = 2.1;
    post.castShadow = !this.isSoftwareGl;
    group.add(post);

    const lanternGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    const lantern = new THREE.Mesh(lanternGeo, glowMat);
    lantern.position.y = 4.3;
    group.add(lantern);

    const capGeo = new THREE.ConeGeometry(0.65, 0.35, 4);
    capGeo.rotateY(Math.PI / 4);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 4.9;
    group.add(cap);

    const lightCircleGeo = new THREE.CircleGeometry(3.5, 16);
    lightCircleGeo.rotateX(-Math.PI / 2);
    const lightCircleMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const lightCircle = new THREE.Mesh(lightCircleGeo, lightCircleMat);
    lightCircle.position.y = 0.015;
    group.add(lightCircle);

    return group;
  }

  private createVillageSquareCenter(): THREE.Group {
    const group = new THREE.Group();
    const plazaGeo = new THREE.CylinderGeometry(9, 9.2, 0.15, 24);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
    const plaza = new THREE.Mesh(plazaGeo, stoneMat);
    plaza.position.y = 0.08;
    group.add(plaza);

    const snowman = new THREE.Group();
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const btmBall = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), snowMat);
    btmBall.position.y = 0.8;
    const midBall = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 12), snowMat);
    midBall.position.y = 1.9;
    const topBall = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), snowMat);
    topBall.position.y = 2.75;
    snowman.add(btmBall, midBall, topBall);

    const carrotGeo = new THREE.ConeGeometry(0.08, 0.45, 6);
    carrotGeo.rotateX(Math.PI / 2);
    const carrotMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.5 });
    const carrot = new THREE.Mesh(carrotGeo, carrotMat);
    carrot.position.set(0, 2.75, 0.45);
    snowman.add(carrot);

    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    hatBrim.position.y = 3.12;
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
    hatTop.position.y = 3.38;
    snowman.add(hatBrim, hatTop);

    snowman.position.set(0, 0.1, 0);
    group.add(snowman);

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const x = Math.cos(angle) * 7.5;
      const z = Math.sin(angle) * 7.5;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), new THREE.MeshStandardMaterial({ color: 0x334155 }));
      post.position.set(x, 1.4, z);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0xef4444 : 0x22c55e,
        emissive: i % 2 === 0 ? 0xef4444 : 0x22c55e,
        emissiveIntensity: 2.0,
      }));
      orb.position.set(x, 2.8, z);
      group.add(post, orb);
    }

    return group;
  }

  /**
   * Road network with realistic asphalt, painted centerlines, and zebra pedestrian crosswalks
   */
  private buildRoadsAndSnow() {
    this.scene.add(this.roadMeshGroup);

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.75,
      metalness: 0.1,
    });

    const addRoadStrip = (x: number, z: number, w: number, d: number) => {
      const roadGeo = new THREE.PlaneGeometry(w, d);
      roadGeo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(roadGeo, roadMat);
      mesh.position.set(x, 0.03, z);
      mesh.receiveShadow = !this.isSoftwareGl;
      this.roadMeshGroup.add(mesh);

      const halfW = w / 2;
      const halfD = d / 2;
      const minX = Math.max(0, Math.floor(x - halfW + this.ARENA_SIZE / 2));
      const maxX = Math.min(this.GRID_RES - 1, Math.floor(x + halfW + this.ARENA_SIZE / 2));
      const minZ = Math.max(0, Math.floor(z - halfD + this.ARENA_SIZE / 2));
      const maxZ = Math.min(this.GRID_RES - 1, Math.floor(z + halfD + this.ARENA_SIZE / 2));

      for (let gz = minZ; gz <= maxZ; gz++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const idx = gz * this.GRID_RES + gx;
          this.roadMask[idx] = 1;
        }
      }
    };

    // Main Avenue extends smoothly between North and South Checkpoints (-55 to 55)
    addRoadStrip(0, 0, 8.0, 112);
    // East-West Central Boulevard
    addRoadStrip(0, 0, 94, 8.0);
    // Neighborhood Loop & Cross Streets
    addRoadStrip(-20, 0, 6.5, 46);
    addRoadStrip(20, 0, 6.5, 46);
    addRoadStrip(0, -20, 46, 6.5);
    addRoadStrip(0, 20, 46, 6.5);
    addRoadStrip(-31, 0, 24, 6.5);
    addRoadStrip(-18, -16, 5.5, 12);
    addRoadStrip(18, -16, 5.5, 12);
    addRoadStrip(-18, 16, 5.5, 12);
    addRoadStrip(18, 16, 5.5, 12);
    addRoadStrip(28, 12, 14, 5.5);

    // Realistic Painted Highway Markings: Yellow Double Centerlines along Main Avenue
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let sz = -52; sz <= 52; sz += 5) {
      [-0.15, 0.15].forEach((sx) => {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.8), stripeMat);
        stripe.rotateX(-Math.PI / 2);
        stripe.position.set(sx, 0.035, sz);
        this.roadMeshGroup.add(stripe);
      });
    }

    // Painted White Zebra Pedestrian Crosswalks at key intersections
    const crosswalkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const crosswalkSpots = [
      { x: 0, z: -16, isHoriz: true },
      { x: 0, z: 16, isHoriz: true },
      { x: -16, z: 0, isHoriz: false },
      { x: 16, z: 0, isHoriz: false },
    ];
    crosswalkSpots.forEach((spot) => {
      for (let bar = -3.2; bar <= 3.2; bar += 0.8) {
        const w = spot.isHoriz ? 0.45 : 2.4;
        const d = spot.isHoriz ? 2.4 : 0.45;
        const crosswalkBar = new THREE.Mesh(new THREE.PlaneGeometry(w, d), crosswalkMat);
        crosswalkBar.rotateX(-Math.PI / 2);
        crosswalkBar.position.set(
          spot.isHoriz ? spot.x + bar : spot.x,
          0.036,
          spot.isHoriz ? spot.z : spot.z + bar
        );
        this.roadMeshGroup.add(crosswalkBar);
      }
    });

    // Count plowable snow cells
    let plowableCount = 0;
    for (let i = 0; i < this.roadMask.length; i++) {
      if (this.roadMask[i] === 1) {
        this.snowGrid[i] = 1.0;
        plowableCount++;
      } else {
        this.snowGrid[i] = 0;
      }
    }
    this.totalPlowableCells = plowableCount;
    this.clearedPlowableCells = 0;
    this.clearedCellIndices = [];
    this.instCoords = new Array(plowableCount);

    const snowPatchGeo = new THREE.BoxGeometry(0.96, 0.45, 0.96);
    snowPatchGeo.translate(0, 0.22, 0);

    const snowPatchMat = new THREE.MeshStandardMaterial({
      color: 0xeff6fc,
      roughness: 0.92,
      metalness: 0.02,
    });

    this.snowInstancedMesh = new THREE.InstancedMesh(snowPatchGeo, snowPatchMat, plowableCount);
    this.snowInstancedMesh.receiveShadow = !this.isSoftwareGl;
    this.snowInstancedMesh.castShadow = !this.isSoftwareGl;

    let instIdx = 0;
    for (let gz = 0; gz < this.GRID_RES; gz++) {
      for (let gx = 0; gx < this.GRID_RES; gx++) {
        const cellIdx = gz * this.GRID_RES + gx;
        if (this.roadMask[cellIdx] === 1) {
          const worldX = gx - this.ARENA_SIZE / 2 + 0.5;
          const worldZ = gz - this.ARENA_SIZE / 2 + 0.5;

          _mat4.makeTranslation(worldX, 0.03, worldZ);
          this.snowInstancedMesh.setMatrixAt(instIdx, _mat4);
          this.cellToInstMap[cellIdx] = instIdx;
          this.instCoords[instIdx] = { x: worldX, z: worldZ };
          instIdx++;
        }
      }
    }
    this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
    this.snowInstancedMesh.computeBoundingSphere();
    this.scene.add(this.snowInstancedMesh);

    this.spawnTreasures();
  }

  private spawnTreasures() {
    const treasureTypes: ('bell' | 'cocoa' | 'mittens' | 'firewood')[] = [
      'bell', 'cocoa', 'mittens', 'firewood',
      'bell', 'cocoa', 'mittens', 'firewood'
    ];
    const candidateSpots = [
      { x: -18, z: -14 },
      { x: 18, z: -14 },
      { x: -35, z: 0 },
      { x: 0, z: -30 },
      { x: 0, z: 30 },
      { x: 28, z: 12 },
      { x: -20, z: 18 },
      { x: 20, z: -18 },
    ];

    candidateSpots.forEach((spot, i) => {
      const type = treasureTypes[i];
      const group = new THREE.Group();

      if (type === 'bell') {
        const bell = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 8), new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          metalness: 0.8,
          roughness: 0.2,
          emissive: 0xd97706,
          emissiveIntensity: 0.4,
        }));
        bell.position.y = 0.3;
        group.add(bell);
      } else if (type === 'cocoa') {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8), new THREE.MeshStandardMaterial({
          color: 0xef4444,
          roughness: 0.4,
        }));
        mug.position.y = 0.25;
        const mallow = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8), new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.9,
        }));
        mallow.position.y = 0.48;
        group.add(mug, mallow);
      } else if (type === 'mittens') {
        const mitten = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.9,
        }));
        mitten.rotation.z = Math.PI / 4;
        mitten.position.y = 0.2;
        group.add(mitten);
      } else {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 6), new THREE.MeshStandardMaterial({
          color: 0x78350f,
          roughness: 0.9,
        }));
        log.rotation.z = Math.PI / 2;
        log.position.y = 0.15;
        group.add(log);
      }

      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 16), new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3,
      }));
      ring.rotateX(-Math.PI / 2);
      ring.position.y = 0.05;
      group.add(ring);

      group.position.set(spot.x, 0.04, spot.z);
      this.scene.add(group);

      this.treasures.push({
        id: `treasure-${i}`,
        type,
        x: spot.x,
        z: spot.z,
        found: false,
        mesh: group,
      });
    });
  }

  public buildVehicle(vehicleId: string) {
    this.activeVehicleId = vehicleId;
    const config = VEHICLE_CATALOG.find((v) => v.id === vehicleId) || VEHICLE_CATALOG[0];

    while (this.vehicleGroup.children.length > 0) {
      const obj = this.vehicleGroup.children[0];
      this.vehicleGroup.remove(obj);
    }
    this.wheels = [];
    this.exhaustEmitters = [];

    const stats = calculateEffectiveStats(config, this.upgrades);

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.45, 3.4);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.6 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.45;
    chassis.castShadow = !this.isSoftwareGl;
    this.vehicleGroup.add(chassis);

    const cabColor = new THREE.Color(config.color);
    const cabMat = new THREE.MeshStandardMaterial({
      color: cabColor,
      roughness: 0.45,
      metalness: 0.3,
    });

    const cabinGeo = new THREE.BoxGeometry(1.7, 1.1, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, cabMat);
    cabin.position.set(0, 1.15, 0.1);
    cabin.castShadow = !this.isSoftwareGl;
    this.vehicleGroup.add(cabin);

    // Windshield
    const windshieldGeo = new THREE.BoxGeometry(1.5, 0.7, 0.1);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.8,
    });
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, 1.35, 1.05);
    this.vehicleGroup.add(windshield);

    // Realistic Twin Headlights on Truck Front
    const headlightLensMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfffaed,
      emissiveIntensity: 3.5,
      roughness: 0.1,
    });
    [-0.65, 0.65].forEach((hx) => {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 12), headlightLensMat);
      lens.rotateX(Math.PI / 2);
      lens.position.set(hx, 0.68, 1.75);
      this.vehicleGroup.add(lens);
    });

    // Twin Spotlight Beams Casting Cones of Warm Illumination
    this.leftHeadlight = new THREE.SpotLight(0xfffaed, 3.5, 32, Math.PI / 5, 0.5, 1.2);
    this.leftHeadlight.position.set(-0.65, 0.8, 1.7);
    this.leftHeadlight.target = this.headlightTarget;
    this.vehicleGroup.add(this.leftHeadlight);

    this.rightHeadlight = new THREE.SpotLight(0xfffaed, 3.5, 32, Math.PI / 5, 0.5, 1.2);
    this.rightHeadlight.position.set(0.65, 0.8, 1.7);
    this.rightHeadlight.target = this.headlightTarget;
    this.vehicleGroup.add(this.rightHeadlight);

    // Amber Rotating Roof Beacon
    const beaconGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.25, 8);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.5,
    });
    this.beaconLight = new THREE.Mesh(beaconGeo, beaconMat);
    this.beaconLight.position.set(0, 1.85, 0.2);
    this.vehicleGroup.add(this.beaconLight);

    // Heavy-Duty Front Plow Blade
    const bladeGroup = new THREE.Group();
    const bladeW = stats.bladeWidth;
    const bladeGeo = new THREE.BoxGeometry(bladeW, 0.75, 0.25);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.bladeColor),
      metalness: 0.85,
      roughness: 0.25,
    });
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.position.y = 0.42;
    bladeMesh.castShadow = !this.isSoftwareGl;
    bladeGroup.add(bladeMesh);

    // Hazard markers on plow tips
    const markerMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.5 });
    [-bladeW / 2 + 0.1, bladeW / 2 - 0.1].forEach((px) => {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), markerMat);
      tip.position.set(px, 0.78, 0);
      bladeGroup.add(tip);
    });

    bladeGroup.position.set(0, 0, 2.0);
    this.vehicleGroup.add(bladeGroup);
    this.plowBladeGroup = bladeGroup;

    // Salt Spreader Hopper on rear
    const hopperGeo = new THREE.BoxGeometry(1.6, 0.8, 1.2);
    const hopperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.accentColor),
      metalness: 0.5,
      roughness: 0.5,
    });
    const hopper = new THREE.Mesh(hopperGeo, hopperMat);
    hopper.position.set(0, 0.9, -1.0);
    hopper.castShadow = !this.isSoftwareGl;
    this.vehicleGroup.add(hopper);

    const spinnerGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 8);
    const spinnerMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 });
    this.saltSpinner = new THREE.Mesh(spinnerGeo, spinnerMat);
    this.saltSpinner.position.set(0, 0.35, -1.8);
    this.vehicleGroup.add(this.saltSpinner);

    // 4 Heavy-Duty Rubber Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.35, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.9 });

    const wheelPositions = [
      { x: -0.95, y: 0.44, z: 1.1 },
      { x: 0.95, y: 0.44, z: 1.1 },
      { x: -0.95, y: 0.44, z: -1.1 },
      { x: 0.95, y: 0.44, z: -1.1 },
    ];

    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.castShadow = !this.isSoftwareGl;
      this.vehicleGroup.add(wheel);
      this.wheels.push(wheel);
    });

    // Exhaust Pipe
    const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.position.set(0.75, 1.5, -0.6);
    this.vehicleGroup.add(pipe);
    this.exhaustEmitters.push(new THREE.Vector3(0.75, 2.1, -0.6));
  }

  private initParticlePools() {
    // Snow Spray particles
    const sprayGeo = new THREE.DodecahedronGeometry(0.18);
    const sprayMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.1,
    });

    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(sprayGeo, sprayMat);
      mesh.visible = false;
      this.snowParticleGroup.add(mesh);
      this.snowParticles.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5,
        active: false,
      });
    }

    // Steam / Exhaust Particles
    const steamGeo = new THREE.SphereGeometry(0.14, 6, 6);
    const steamMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(steamGeo, steamMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.steamParticles.push({
        mesh,
        life: 0,
        maxLife: 0.8,
        vel: new THREE.Vector3(0, 1.2, 0),
      });
    }

    // Chimney Smoke Particles
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(steamGeo, steamMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.chimneyParticles.push({
        mesh,
        life: 0,
        maxLife: 1.8,
        vel: new THREE.Vector3(0, 1.5, 0),
      });
    }
  }

  public emitSnowSpray(leftSide: boolean, speed: number) {
    const bladeOffset = leftSide ? -1.2 : 1.2;
    const forwardX = Math.sin(this.vehicleHeading);
    const forwardZ = Math.cos(this.vehicleHeading);
    const rightX = Math.cos(this.vehicleHeading);
    const rightZ = -Math.sin(this.vehicleHeading);

    for (let i = 0; i < 3; i++) {
      const p = this.snowParticles.find((part) => !part.active);
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = 0.35 + Math.random() * 0.25;
      p.mesh.visible = true;

      const spawnX = this.vehiclePosition.x + forwardX * 2.2 + rightX * bladeOffset * (0.8 + Math.random() * 0.4);
      const spawnZ = this.vehiclePosition.z + forwardZ * 2.2 + rightZ * bladeOffset * (0.8 + Math.random() * 0.4);
      p.pos.set(spawnX, 0.35, spawnZ);
      p.mesh.position.copy(p.pos);

      const lateralDir = leftSide ? -1 : 1;
      const spraySpeed = 2.5 + speed * 0.25 + Math.random() * 1.5;
      p.vel.set(
        rightX * lateralDir * spraySpeed + forwardX * 1.2 + (Math.random() - 0.5) * 0.8,
        1.8 + Math.random() * 1.6,
        rightZ * lateralDir * spraySpeed + forwardZ * 1.2 + (Math.random() - 0.5) * 0.8
      );
    }
  }

  public emitBurstSprayAt(x: number, y: number, z: number, count: number = 8) {
    for (let i = 0; i < count; i++) {
      const p = this.snowParticles.find((part) => !part.active);
      if (!p) break;

      p.active = true;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.3;
      p.mesh.visible = true;
      p.pos.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8);
      p.mesh.position.copy(p.pos);

      p.vel.set(
        (Math.random() - 0.5) * 4.0,
        2.5 + Math.random() * 2.2,
        (Math.random() - 0.5) * 4.0
      );
    }
  }

  public emitSteam() {
    const p = this.steamParticles.find((part) => part.life >= part.maxLife || !part.mesh.visible);
    if (!p) return;

    p.life = 0;
    p.maxLife = 0.6 + Math.random() * 0.4;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(0.8);

    const emitterLocal = this.exhaustEmitters[0] || new THREE.Vector3(0, 1.8, -1.0);
    _vec3A.copy(emitterLocal).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.vehicleHeading);
    p.mesh.position.copy(this.vehiclePosition).add(_vec3A);
    p.vel.set((Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3);
  }

  private emitChimneySmoke() {
    if (this.chimneySmokeEmitters.length === 0) return;
    const emitter = this.chimneySmokeEmitters[Math.floor(Math.random() * this.chimneySmokeEmitters.length)];
    const p = this.chimneyParticles.find((part) => part.life >= part.maxLife || !part.mesh.visible);
    if (!p) return;

    p.life = 0;
    p.maxLife = 1.6 + Math.random() * 0.8;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(0.7);
    p.mesh.position.copy(emitter);

    const weatherCfg = WEATHER_CONFIGS[this.currentWeatherStage];
    const windDirX = Math.cos(weatherCfg.windAngleRad);
    const windDirZ = Math.sin(weatherCfg.windAngleRad);
    const windSpeedFactor = weatherCfg.windSpeedKmH * 0.04;

    p.vel.set(
      windDirX * windSpeedFactor + (Math.random() - 0.5) * 0.4,
      1.4 + Math.random() * 0.6,
      windDirZ * windSpeedFactor + (Math.random() - 0.5) * 0.4
    );
  }

  /**
   * Toggle between driving the plow truck and walking on foot!
   */
  public toggleVehicleMode() {
    if (this.controlMode === 'vehicle') {
      sound.playHopInOut();
      this.controlMode = 'foot';
      const rightX = Math.cos(this.vehicleHeading);
      const rightZ = -Math.sin(this.vehicleHeading);
      this.characterPosition.set(
        this.vehiclePosition.x - rightX * 1.8,
        0,
        this.vehiclePosition.z - rightZ * 1.8
      );
      this.characterHeading = this.vehicleHeading - Math.PI / 2;
      this.characterGroup.position.copy(this.characterPosition);
      this.characterGroup.rotation.y = this.characterHeading;
      this.characterGroup.visible = true;
      sound.idleEngineWhenParked();
      this.callbacks.onModeChange('foot');
    } else {
      const dist = Math.hypot(
        this.characterPosition.x - this.vehiclePosition.x,
        this.characterPosition.z - this.vehiclePosition.z
      );
      if (dist <= 3.2) {
        sound.playHopInOut();
        this.controlMode = 'vehicle';
        this.characterGroup.visible = false;
        this.callbacks.onModeChange('vehicle');
      }
    }
  }

  /**
   * Dynamic Snowfall & Weather Intensity Simulation Loop
   */
  private updateWeather(dt: number) {
    this.weatherTimer += dt;
    const currentCfg = WEATHER_CONFIGS[this.currentWeatherStage] || WEATHER_CONFIGS.flurry;

    // Check stage cycle progression
    if (this.weatherTimer >= currentCfg.durationSeconds) {
      this.weatherTimer = 0;
      const nextStage = getNextWeatherStage(this.currentWeatherStage);
      this.currentWeatherStage = nextStage;
      const nextCfg = WEATHER_CONFIGS[nextStage] || WEATHER_CONFIGS.flurry;

      if (nextCfg.isBlizzardAlert) {
        sound.playBlizzardAlert();
      }

      this.callbacks.onWeatherChange(nextStage, nextCfg);
    }

    const targetCfg = WEATHER_CONFIGS[this.currentWeatherStage] || WEATHER_CONFIGS.flurry;

    // Smooth lerp fog
    const lerpRate = dt * 1.5;
    this.currentFogNear = THREE.MathUtils.lerp(this.currentFogNear, targetCfg.fogNear, lerpRate);
    this.currentFogFar = THREE.MathUtils.lerp(this.currentFogFar, targetCfg.fogFar, lerpRate);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = this.currentFogNear;
      this.scene.fog.far = this.currentFogFar;
      this.currentFogColor.lerp(new THREE.Color(targetCfg.fogColor), lerpRate);
      this.scene.fog.color.copy(this.currentFogColor);
      this.scene.background = this.currentFogColor;
    }

    // Smooth lerp lights
    this.dirLight.intensity = THREE.MathUtils.lerp(this.dirLight.intensity, targetCfg.sunIntensity, lerpRate);
    this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, targetCfg.ambientIntensity, lerpRate);

    // Update ambient falling snow flakes (drift with wind)
    const windSpeedFactor = targetCfg.windSpeedKmH * 0.08;
    const windX = Math.cos(targetCfg.windAngleRad) * windSpeedFactor;
    const windZ = Math.sin(targetCfg.windAngleRad) * windSpeedFactor;
    const fallSpeed = targetCfg.snowParticlesSpeed * 0.5;

    const followPos = this.controlMode === 'vehicle' ? this.vehiclePosition : this.characterPosition;

    for (let i = 0; i < this.AMBIENT_FLAKES_COUNT; i++) {
      const idx = i * 3;
      this.ambientFlakesPos[idx + 0] += (windX + this.ambientFlakesVel[idx + 0] * 0.2) * dt;
      this.ambientFlakesPos[idx + 1] += -(fallSpeed + Math.abs(this.ambientFlakesVel[idx + 1]) * 0.3) * dt;
      this.ambientFlakesPos[idx + 2] += (windZ + this.ambientFlakesVel[idx + 2] * 0.2) * dt;

      // Wrap around player view
      if (this.ambientFlakesPos[idx + 1] <= 0.1) {
        this.ambientFlakesPos[idx + 1] = 26.0 + Math.random() * 4.0;
        this.ambientFlakesPos[idx + 0] = followPos.x + (Math.random() - 0.5) * 80;
        this.ambientFlakesPos[idx + 2] = followPos.z + (Math.random() - 0.5) * 80;
      }
    }
    this.ambientFlakesGeom.attributes.position.needsUpdate = true;

    // Dynamic Snow Re-Accumulation on plowed roads during steady & blizzard weather!
    if (targetCfg.accumulationRatePerSec > 0 && this.clearedCellIndices.length > 0) {
      const acc = calculateSnowAccumulationCount(
        targetCfg.accumulationRatePerSec,
        dt,
        this.snowAccumulator
      );
      this.snowAccumulator = acc.newAccumulator;

      if (acc.cellsToAdd > 0) {
        const count = Math.min(acc.cellsToAdd, this.clearedCellIndices.length);
        for (let c = 0; c < count; c++) {
          const randIdx = Math.floor(Math.random() * this.clearedCellIndices.length);
          const cellIdx = this.clearedCellIndices.splice(randIdx, 1)[0];
          this.snowGrid[cellIdx] = 1.0;
          this.clearedPlowableCells = Math.max(0, this.clearedPlowableCells - 1);
          this.restoreSnowInstance(cellIdx);
        }
        const pct = Math.min(100, (this.clearedPlowableCells / Math.max(1, this.totalPlowableCells)) * 100);
        this.callbacks.onClearanceUpdate(pct);
      }
    }
  }

  /**
   * Restores an instanced snow chunk mesh when fresh snow re-accumulates
   */
  private restoreSnowInstance(cellIdx: number) {
    const instIdx = this.cellToInstMap[cellIdx];
    if (instIdx >= 0 && this.snowInstancedMesh && this.instCoords[instIdx]) {
      const { x, z } = this.instCoords[instIdx];
      _mat4.makeTranslation(x, 0.03, z);
      this.snowInstancedMesh.setMatrixAt(instIdx, _mat4);
      this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Main Simulation Step
   */
  public update(dt: number) {
    if (this.destroyed) return;
    const clampedDt = Math.min(dt, 0.05);

    // Weather & Accumulation loop
    this.updateWeather(clampedDt);

    if (this.isTitleFlyover) {
      this.titleFlyoverAngle += clampedDt * 0.18;
      const radius = 42;
      const camX = Math.cos(this.titleFlyoverAngle) * radius;
      const camZ = Math.sin(this.titleFlyoverAngle) * radius;
      this.camera.position.set(camX, 28, camZ);
      this.camera.lookAt(0, 2, 0);

      if (this.beaconLight) {
        this.beaconLight.rotation.y += clampedDt * 8;
      }
      this.updateCitizens(clampedDt);
      return;
    }

    if (this.controlMode === 'vehicle') {
      this.updateVehicleSimulation(clampedDt);
    } else {
      this.updateFootSimulation(clampedDt);
    }

    // Update Town Citizens (MCPs)
    this.updateCitizens(clampedDt);

    // Check buried treasures
    this.checkTreasures();

    // Check Highway Checkpoints Proximity
    this.checkHighwayWarningProximity();

    // Update Particles
    this.updateParticles(clampedDt);

    // Chimney smoke
    if (Math.random() < 0.2) {
      this.emitChimneySmoke();
    }

    // Camera follow (interpolates to active entity)
    const followPos = this.controlMode === 'vehicle' ? this.vehiclePosition : this.characterPosition;
    const cameraOffset = this.controlMode === 'vehicle' ? new THREE.Vector3(0, 24, 28) : new THREE.Vector3(0, 16, 20);
    this.cameraTarget.copy(followPos).add(cameraOffset);
    const dampFactor = 1 - Math.exp(-6.0 * clampedDt);
    this.camera.position.lerp(this.cameraTarget, dampFactor);
    this.camera.lookAt(followPos.x, followPos.y + 0.8, followPos.z);
  }

  private updateVehicleSimulation(clampedDt: number) {
    const config = VEHICLE_CATALOG.find((v) => v.id === this.activeVehicleId) || VEHICLE_CATALOG[0];
    const stats = calculateEffectiveStats(config, this.upgrades);

    // Boost
    if (this.inputs.boost && this.boostCharge > 0.05) {
      if (!this.isBoosting) sound.playBoost();
      this.isBoosting = true;
      this.boostCharge = Math.max(0, this.boostCharge - clampedDt / stats.boostDuration);
    } else {
      this.isBoosting = false;
      this.boostCharge = Math.min(1.0, this.boostCharge + clampedDt * 0.15);
    }
    this.callbacks.onBoostUpdate(this.boostCharge);

    // Salt
    if (this.inputs.salt && this.saltRemaining > 0.01) {
      if (!this.saltActive) sound.playSaltSpread();
      this.saltActive = true;
      this.saltRemaining = Math.max(0, this.saltRemaining - clampedDt * 0.08);
      if (this.saltSpinner) {
        this.saltSpinner.rotation.y += clampedDt * 24;
      }
    } else {
      this.saltActive = false;
    }
    this.callbacks.onSaltRemainingUpdate(this.saltRemaining);

    // Acceleration
    let targetAccel = 0;
    if (this.inputs.forward) targetAccel += stats.acceleration;
    if (this.inputs.backward) targetAccel -= stats.acceleration * 0.65;

    const topSpeed = this.isBoosting ? stats.maxSpeed * 1.5 : stats.maxSpeed;

    if (targetAccel !== 0) {
      this.vehicleVelocity += targetAccel * clampedDt;
      this.vehicleVelocity = Math.max(-stats.maxSpeed * 0.5, Math.min(topSpeed, this.vehicleVelocity));
    } else {
      const drag = 12.0 * clampedDt;
      if (this.vehicleVelocity > 0) {
        this.vehicleVelocity = Math.max(0, this.vehicleVelocity - drag);
      } else if (this.vehicleVelocity < 0) {
        this.vehicleVelocity = Math.min(0, this.vehicleVelocity + drag);
      }
    }

    // Steering
    let targetSteer = 0;
    if (this.inputs.left) targetSteer += 1;
    if (this.inputs.right) targetSteer -= 1;

    if (Math.abs(this.vehicleVelocity) > 0.2) {
      const speedSign = Math.sign(this.vehicleVelocity);
      this.vehicleHeading += targetSteer * stats.turnRate * speedSign * clampedDt;
    }

    // Proposed movement
    const moveDist = this.vehicleVelocity * clampedDt;
    let nextX = this.vehiclePosition.x + Math.sin(this.vehicleHeading) * moveDist;
    let nextZ = this.vehiclePosition.z + Math.cos(this.vehicleHeading) * moveDist;

    // SOLID OBSTACLE COLLISIONS: Cabins (Houses)
    let collidedWithSolid = false;
    const vehicleRadius = 1.45;

    for (const box of this.cabinBoxes) {
      const res = resolveCircleBoxCollision(nextX, nextZ, vehicleRadius, box);
      if (res.collided) {
        nextX = res.x;
        nextZ = res.z;
        collidedWithSolid = true;
      }
    }

    // SOLID OBSTACLE COLLISIONS: Highway Checkpoint Barriers
    for (const box of this.barrierBoxes) {
      const res = resolveCircleBoxCollision(nextX, nextZ, vehicleRadius, box);
      if (res.collided) {
        nextX = res.x;
        nextZ = res.z;
        collidedWithSolid = true;
      }
    }

    // SOLID OBSTACLE COLLISIONS: Pine Trees
    for (const tree of this.treeCircles) {
      const res = resolveCircleCircleCollision(nextX, nextZ, vehicleRadius, tree);
      if (res.collided) {
        nextX = res.x;
        nextZ = res.z;
        collidedWithSolid = true;
      }
    }

    // SOLID OBSTACLE COLLISIONS: Streetlamps
    for (const lamp of this.lampCircles) {
      const res = resolveCircleCircleCollision(nextX, nextZ, vehicleRadius, lamp);
      if (res.collided) {
        nextX = res.x;
        nextZ = res.z;
        collidedWithSolid = true;
      }
    }

    if (collidedWithSolid) {
      if (Math.abs(this.vehicleVelocity) > 2.5) {
        sound.playCrashImpact();
        this.callbacks.onCrash();
      }
      this.vehicleVelocity = -this.vehicleVelocity * 0.2; // Gentle stop / bounce
    }

    // Road boundary clamp (smooth natural limits within Highway Checkpoints)
    nextX = Math.max(-54, Math.min(54, nextX));
    nextZ = Math.max(-55, Math.min(55, nextZ));

    this.vehiclePosition.x = nextX;
    this.vehiclePosition.z = nextZ;

    this.vehicleGroup.position.copy(this.vehiclePosition);
    this.vehicleGroup.rotation.y = this.vehicleHeading;

    // Update Headlight Target
    this.headlightTarget.position.set(
      this.vehiclePosition.x + Math.sin(this.vehicleHeading) * 14,
      0.1,
      this.vehiclePosition.z + Math.cos(this.vehicleHeading) * 14
    );

    // Animate wheels
    const wheelRot = (moveDist / 0.44) * 2;
    this.wheels.forEach((w) => {
      w.rotation.x += wheelRot;
    });

    if (this.beaconLight) {
      this.beaconLight.rotation.y += clampedDt * 10;
    }

    if (Math.random() < 0.25) {
      this.emitSteam();
    }

    // Snow Plowing
    const speedRatio = Math.abs(this.vehicleVelocity) / stats.maxSpeed;
    const isMovingForward = this.vehicleVelocity > 0.8;
    let plowedVolumeThisFrame = 0;

    if (isMovingForward) {
      const forwardX = Math.sin(this.vehicleHeading);
      const forwardZ = Math.cos(this.vehicleHeading);
      const bladeX = this.vehiclePosition.x + forwardX * 2.2;
      const bladeZ = this.vehiclePosition.z + forwardZ * 2.2;

      const clearingRadius = stats.bladeWidth * 0.65;
      const cellRad = Math.ceil(clearingRadius);

      const centerGx = Math.floor(bladeX + this.ARENA_SIZE / 2);
      const centerGz = Math.floor(bladeZ + this.ARENA_SIZE / 2);

      let clearedAny = false;

      for (let dz = -cellRad; dz <= cellRad; dz++) {
        for (let dx = -cellRad; dx <= cellRad; dx++) {
          const gx = centerGx + dx;
          const gz = centerGz + dz;
          if (gx >= 0 && gx < this.GRID_RES && gz >= 0 && gz < this.GRID_RES) {
            const dist = Math.hypot(dx, dz);
            if (dist <= clearingRadius) {
              const cellIdx = gz * this.GRID_RES + gx;
              if (this.roadMask[cellIdx] === 1 && this.snowGrid[cellIdx] > 0) {
                plowedVolumeThisFrame += this.snowGrid[cellIdx];
                this.snowGrid[cellIdx] = 0;
                this.clearedPlowableCells++;
                this.clearedCellIndices.push(cellIdx);
                clearedAny = true;
                this.hideSnowInstance(cellIdx);
              }
            }
          }
        }
      }

      if (this.saltActive) {
        const saltRad = stats.saltRadius;
        const sCellRad = Math.ceil(saltRad);
        const vGx = Math.floor(this.vehiclePosition.x + this.ARENA_SIZE / 2);
        const vGz = Math.floor(this.vehiclePosition.z + this.ARENA_SIZE / 2);

        for (let dz = -sCellRad; dz <= sCellRad; dz++) {
          for (let dx = -sCellRad; dx <= sCellRad; dx++) {
            const gx = vGx + dx;
            const gz = vGz + dz;
            if (gx >= 0 && gx < this.GRID_RES && gz >= 0 && gz < this.GRID_RES) {
              if (Math.hypot(dx, dz) <= saltRad) {
                const cellIdx = gz * this.GRID_RES + gx;
                if (this.roadMask[cellIdx] === 1 && this.snowGrid[cellIdx] > 0) {
                  plowedVolumeThisFrame += this.snowGrid[cellIdx];
                  this.snowGrid[cellIdx] = 0;
                  this.clearedPlowableCells++;
                  this.clearedCellIndices.push(cellIdx);
                  clearedAny = true;
                  this.hideSnowInstance(cellIdx);
                }
              }
            }
          }
        }
      }

      if (clearedAny) {
        this.emitSnowSpray(true, this.vehicleVelocity);
        this.emitSnowSpray(false, this.vehicleVelocity);
        sound.updateSnowCrunch(0.85);
        this.callbacks.onSnowPlowed(plowedVolumeThisFrame, bladeX, bladeZ);

        const pct = Math.min(100, (this.clearedPlowableCells / Math.max(1, this.totalPlowableCells)) * 100);
        this.callbacks.onClearanceUpdate(pct);
      } else {
        sound.updateSnowCrunch(0.0);
      }
    } else {
      sound.updateSnowCrunch(0.0);
    }

    sound.updateEngine(speedRatio, isMovingForward);
    const speedKmH = Math.round(Math.abs(this.vehicleVelocity) * 2.8);
    this.callbacks.onSpeedUpdate(speedKmH);
  }

  /**
   * Updates pedestrian town citizens (MCPs) and detects safety violations
   */
  private updateCitizens(clampedDt: number) {
    this.citizens.forEach((citizen) => {
      // Cooldowns
      if (citizen.fineCooldown > 0) {
        citizen.fineCooldown = Math.max(0, citizen.fineCooldown - clampedDt);
      }

      if (citizen.isStartled) {
        citizen.startledTimer -= clampedDt;
        // Startled hopping animation
        citizen.group.position.y = Math.sin(citizen.startledTimer * 14) * 0.45;
        citizen.arms.forEach((arm, i) => {
          arm.rotation.z = (i === 0 ? -1 : 1) * 1.5;
        });
        if (citizen.startledTimer <= 0) {
          citizen.isStartled = false;
          citizen.group.position.y = 0;
          citizen.arms.forEach((arm) => {
            arm.rotation.z = 0;
          });
        }
        return;
      }

      // Waypoint Patrol
      const targetWp = citizen.waypoints[citizen.currentWaypointIdx];
      const dx = targetWp.x - citizen.x;
      const dz = targetWp.z - citizen.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.8) {
        citizen.currentWaypointIdx = (citizen.currentWaypointIdx + 1) % citizen.waypoints.length;
      } else {
        const moveDist = citizen.speed * clampedDt;
        const dirX = dx / dist;
        const dirZ = dz / dist;

        citizen.x += dirX * moveDist;
        citizen.z += dirZ * moveDist;
        citizen.heading = Math.atan2(dirX, dirZ);

        citizen.group.position.set(citizen.x, 0, citizen.z);
        citizen.group.rotation.y = citizen.heading;

        // Walk Leg Animation
        citizen.walkCycle += clampedDt * 8.0;
        citizen.legs[0].rotation.x = Math.sin(citizen.walkCycle) * 0.45;
        citizen.legs[1].rotation.x = -Math.sin(citizen.walkCycle) * 0.45;
      }

      // COLLISION CHECK with vehicle
      if (this.controlMode === 'vehicle') {
        const vehicleRadius = 1.45;
        const citizenRadius = 0.55;
        const distToVehicle = Math.hypot(citizen.x - this.vehiclePosition.x, citizen.z - this.vehiclePosition.z);

        if (distToVehicle < vehicleRadius + citizenRadius) {
          // If moving into pedestrian, assess Municipal Safety Fine!
          if (citizen.fineCooldown <= 0 && Math.abs(this.vehicleVelocity) > 0.4) {
            citizen.isStartled = true;
            citizen.startledTimer = 1.8;
            citizen.fineCooldown = 3.5;

            // Push vehicle back slightly
            this.vehicleVelocity = -this.vehicleVelocity * 0.35;

            sound.playCrashImpact();
            sound.playMunicipalViolation();

            const reason = `CITIZEN SAFETY VIOLATION: Careless collision with ${citizen.name} on town walkway!`;
            this.callbacks.onMunicipalFine(100, reason);
          }
        }
      }
    });
  }

  private updateFootSimulation(clampedDt: number) {
    const walkSpeed = 6.8;
    let moveX = 0;
    let moveZ = 0;

    if (this.inputs.forward) moveZ += 1;
    if (this.inputs.backward) moveZ -= 1;
    if (this.inputs.left) moveX -= 1;
    if (this.inputs.right) moveX += 1;

    const isMoving = moveX !== 0 || moveZ !== 0;

    if (isMoving) {
      const len = Math.hypot(moveX, moveZ);
      const dirX = moveX / len;
      const dirZ = moveZ / len;

      this.characterHeading = Math.atan2(dirX, dirZ);
      this.characterGroup.rotation.y = this.characterHeading;

      let nextX = this.characterPosition.x + dirX * walkSpeed * clampedDt;
      let nextZ = this.characterPosition.z + dirZ * walkSpeed * clampedDt;

      // Character collisions against cabins
      const charRadius = 0.55;
      for (const box of this.cabinBoxes) {
        const res = resolveCircleBoxCollision(nextX, nextZ, charRadius, box);
        if (res.collided) {
          nextX = res.x;
          nextZ = res.z;
        }
      }

      for (const tree of this.treeCircles) {
        const res = resolveCircleCircleCollision(nextX, nextZ, charRadius, tree);
        if (res.collided) {
          nextX = res.x;
          nextZ = res.z;
        }
      }

      // Collide against parked vehicle
      const vDist = Math.hypot(nextX - this.vehiclePosition.x, nextZ - this.vehiclePosition.z);
      if (vDist < 1.6) {
        const pushX = (nextX - this.vehiclePosition.x) / vDist;
        const pushZ = (nextZ - this.vehiclePosition.z) / vDist;
        nextX = this.vehiclePosition.x + pushX * 1.6;
        nextZ = this.vehiclePosition.z + pushZ * 1.6;
      }

      nextX = Math.max(-54, Math.min(54, nextX));
      nextZ = Math.max(-54, Math.min(54, nextZ));

      this.characterPosition.x = nextX;
      this.characterPosition.z = nextZ;
      this.characterGroup.position.copy(this.characterPosition);

      this.characterWalkTime += clampedDt * 10;
      this.characterGroup.position.y = Math.abs(Math.sin(this.characterWalkTime)) * 0.08;
    } else {
      this.characterGroup.position.y = 0;
    }

    // Check proximity to vehicle
    const distToTruck = Math.hypot(
      this.characterPosition.x - this.vehiclePosition.x,
      this.characterPosition.z - this.vehiclePosition.z
    );
    this.callbacks.onNearVehicleChange(distToTruck <= 3.2);

    // Check proximity to interactive cabin work sites
    let activePrompt: string | null = null;
    let closestCabinSite: CabinWorkSite | null = null;
    let siteActionType: 'porch' | 'roof' | null = null;

    for (const site of this.cabinWorkSites) {
      const pDist = Math.hypot(this.characterPosition.x - site.x, this.characterPosition.z - (site.z + 4.2));
      if (pDist < 2.2 && !site.porchCleared) {
        activePrompt = `Press [SPACE] to Shovel Cabin #${site.index + 1} Porch!`;
        closestCabinSite = site;
        siteActionType = 'porch';
        break;
      }

      const rDist = Math.hypot(this.characterPosition.x - (site.x - 4.15), this.characterPosition.z - site.z);
      if (rDist < 2.2 && !site.roofCleared) {
        activePrompt = `Press [SPACE] to Rake Snow from Cabin #${site.index + 1} Roof!`;
        closestCabinSite = site;
        siteActionType = 'roof';
        break;
      }
    }

    this.callbacks.onNearWorkOrderChange(activePrompt);

    // Perform Shovel or Rake action when SPACE is pressed!
    if (this.inputs.action && !this.isShoveling) {
      this.isShoveling = true;
      this.shovelAnimTime = 0;
      sound.playShovelScoop();

      if (closestCabinSite && siteActionType) {
        if (siteActionType === 'porch') {
          closestCabinSite.porchCleared = true;
          closestCabinSite.porchMarker.visible = false;
          this.emitBurstSprayAt(closestCabinSite.x, 0.6, closestCabinSite.z + 4.2, 12);
          this.callbacks.onPorchShoveled(closestCabinSite.index);
        } else if (siteActionType === 'roof') {
          closestCabinSite.roofCleared = true;
          closestCabinSite.roofSnowMesh.visible = false;
          this.emitBurstSprayAt(closestCabinSite.x, 5.5, closestCabinSite.z, 20);
          this.callbacks.onRoofRaked(closestCabinSite.index);
        }
      } else {
        const charFrontX = this.characterPosition.x + Math.sin(this.characterHeading) * 1.0;
        const charFrontZ = this.characterPosition.z + Math.cos(this.characterHeading) * 1.0;
        this.emitBurstSprayAt(charFrontX, 0.4, charFrontZ, 5);
      }
    }

    // Animate shovel swing
    if (this.isShoveling && this.shovelMesh) {
      this.shovelAnimTime += clampedDt * 8;
      this.shovelMesh.rotation.x = 0.25 + Math.sin(this.shovelAnimTime * Math.PI) * 0.8;
      if (this.shovelAnimTime >= 1.0) {
        this.isShoveling = false;
        this.shovelMesh.rotation.x = 0.25;
      }
    }

    this.callbacks.onSpeedUpdate(isMoving ? 7 : 0);
  }

  private hideSnowInstance(cellIdx: number) {
    const instIdx = this.cellToInstMap[cellIdx];
    if (instIdx >= 0 && this.snowInstancedMesh) {
      _mat4.makeScale(0, 0, 0);
      this.snowInstancedMesh.setMatrixAt(instIdx, _mat4);
      this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private checkTreasures() {
    const checkPos = this.controlMode === 'vehicle' ? this.vehiclePosition : this.characterPosition;
    this.treasures.forEach((t) => {
      if (t.found) {
        t.mesh.rotation.y += 0.05;
        return;
      }
      const dist = Math.hypot(t.x - checkPos.x, t.z - checkPos.z);
      if (dist < 2.5) {
        t.found = true;
        sound.playPickup();
        t.mesh.position.y += 1.2;
        this.callbacks.onTreasureFound(t.type, t.x, t.z);
      }
    });
  }

  private checkHighwayWarningProximity() {
    const checkPos = this.controlMode === 'vehicle' ? this.vehiclePosition : this.characterPosition;
    const warning = checkHighwayCheckpointWarning(checkPos.x, checkPos.z, 8.5);

    if (warning && performance.now() - this.lastCheckpointWarningTime > 4000) {
      this.lastCheckpointWarningTime = performance.now();
      this.callbacks.onCheckpointWarning(`⚠️ ${warning.name}: ${warning.warningText}`);
    }
  }

  private updateParticles(dt: number) {
    this.snowParticles.forEach((p) => {
      if (!p.active) return;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        return;
      }
      p.vel.y -= 9.8 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      const scale = Math.max(0.01, 1 - p.life / p.maxLife);
      p.mesh.scale.setScalar(scale);
    });

    this.steamParticles.forEach((p) => {
      if (!p.mesh.visible) return;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        return;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      const grow = 0.8 + (p.life / p.maxLife) * 1.5;
      p.mesh.scale.setScalar(grow);
    });

    this.chimneyParticles.forEach((p) => {
      if (!p.mesh.visible) return;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        return;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      const grow = 0.7 + (p.life / p.maxLife) * 2.2;
      p.mesh.scale.setScalar(grow);
    });
  }

  public setPlayingMode() {
    this.isTitleFlyover = false;
    sound.startCozyBgm();
  }

  public setTitleMode() {
    this.isTitleFlyover = true;
    sound.stopCozyBgm();
  }

  public resetPosition() {
    this.controlMode = 'vehicle';
    this.characterGroup.visible = false;
    this.vehiclePosition.set(0, 0.4, 6);
    this.vehicleHeading = Math.PI;
    this.vehicleVelocity = 0;
    this.vehicleGroup.position.copy(this.vehiclePosition);
    this.vehicleGroup.rotation.y = Math.PI;
  }

  private setupWindowResize() {
    const handleResize = () => {
      if (this.destroyed || !this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
  }

  private startLoop() {
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.destroyed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.animFrameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          this.animFrameId = window.setTimeout(cb, 80);
        }
      };
      this.animFrameId = window.setTimeout(poll, 5);
    };

    const tick = (now: number) => {
      if (this.destroyed) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      this.update(dt);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        afterDraw(() => tick(performance.now()));
      } else {
        this.animFrameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      afterDraw(() => tick(performance.now()));
    } else {
      this.animFrameId = requestAnimationFrame(tick);
    }
  }

  public dispose() {
    this.destroyed = true;
    if (this.isSoftwareGl) {
      clearTimeout(this.animFrameId);
    } else {
      cancelAnimationFrame(this.animFrameId);
    }
    sound.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
