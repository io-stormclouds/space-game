import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  NgZone,
  Output,
  EventEmitter,
  Input,
  OnChanges,
  SimpleChanges,
  AfterViewInit
} from '@angular/core';
import * as THREE from 'three';
import { StarData, STAR_DATA } from '../../data/stars.data';

@Component({
  selector: 'app-star-canvas',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: grab;
      &:active { cursor: grabbing; }
    }
  `]
})
export class StarCanvasComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() starSelected = new EventEmitter<StarData | null>();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private starGroup!: THREE.Group;
  private bgStarPoints!: THREE.Points;
  private gridGroup!: THREE.Group;
  private labelCanvas!: HTMLCanvasElement;
  private labelCtx!: CanvasRenderingContext2D;
  private labelTexture!: THREE.CanvasTexture;
  private animationId = 0;

  // Mouse state
  private isDragging = false;
  private prevMouse = { x: 0, y: 0 };
  private rotationX = 0.15;
  private rotationY = 0;
  private targetRotX = 0.15;
  private targetRotY = 0;
  private zoom = 1;
  private targetZoom = 1;

  // Star meshes map
  private starMeshes: Map<number, THREE.Mesh> = new Map();
  private hoveredStar: number | null = null;

  // Glow sprites
  private glowSprites: Map<number, THREE.Sprite> = new Map();

  private raycaster = new THREE.Raycaster();
  private mouse2d = new THREE.Vector2();

  private resizeObserver!: ResizeObserver;

  constructor(private ngZone: NgZone) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.initScene();
      this.buildBackground();
      this.buildGrid();
      this.buildStars();
      this.startRender();
      this.bindEvents();
    });
  }

  private initScene() {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000005, 1);

    this.scene = new THREE.Scene();
    // No scene fog — keep deep space black and crisp

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 5000);
    this.camera.position.set(0, 0, 250);
    this.camera.lookAt(0, 0, 0);

    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);

    this.gridGroup = new THREE.Group();
    this.scene.add(this.gridGroup);

    // Ambient light
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    // Label canvas
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 128;
    this.labelCtx = this.labelCanvas.getContext('2d')!;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
  }

  private buildBackground() {
    const count = 8000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const bgColors = [
      [0.7, 0.8, 1.0],
      [1.0, 0.9, 0.7],
      [1.0, 0.7, 0.5],
      [0.8, 0.9, 1.0],
    ];

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 800 + Math.random() * 1200;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c = bgColors[Math.floor(Math.random() * bgColors.length)];
      const brightness = 0.3 + Math.random() * 0.7;
      colors[i * 3] = c[0] * brightness;
      colors[i * 3 + 1] = c[1] * brightness;
      colors[i * 3 + 2] = c[2] * brightness;

      sizes[i] = 0.5 + Math.random() * 1.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: false
    });

    this.bgStarPoints = new THREE.Points(geo, mat);
    this.scene.add(this.bgStarPoints);
  }

  private buildGrid() {
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x223366,
      transparent: true,
      opacity: 0.35
    });

    const size = 300;
    const step = 30;

    for (let x = -size; x <= size; x += step) {
      const points = [
        new THREE.Vector3(x, 0, -size),
        new THREE.Vector3(x, 0, size)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geo, gridMat));
    }
    for (let z = -size; z <= size; z += step) {
      const points = [
        new THREE.Vector3(-size, 0, z),
        new THREE.Vector3(size, 0, z)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geo, gridMat));
    }

    // Vertical guide lines for named stars
    const guideMat = new THREE.LineBasicMaterial({
      color: 0x334488,
      transparent: true,
      opacity: 0.25
    });
    for (const star of STAR_DATA) {
      if (star.distance > 100) continue;
      const pos = this.starToScene(star);
      const pts = [
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Vector3(pos.x, 0, pos.z)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.gridGroup.add(new THREE.Line(geo, guideMat));
    }
  }

  private starToScene(star: StarData): THREE.Vector3 {
    // Map parsec coordinates to scene units — scale factor 8 for good spread
    return new THREE.Vector3(star.x * 16, star.y * 16, star.z * 16);
  }

  private glowTexture(): THREE.Texture {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.1, 'rgba(255,255,200,0.9)');
    grad.addColorStop(0.4, 'rgba(200,200,255,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  private buildStars() {
    const glowTex = this.glowTexture();

    for (const star of STAR_DATA) {
      const pos = this.starToScene(star);

      // Star size based on magnitude / luminosity
      const baseSize = Math.max(0.3, Math.min(4, 1.5 - star.absoluteMag * 0.08));
      const radius = star.distance === 0 ? 2.2 : baseSize;

      // Core sphere
      const geo = new THREE.SphereGeometry(radius, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(star.color) });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { starId: star.id };
      this.starGroup.add(mesh);
      this.starMeshes.set(star.id, mesh);

      // Glow sprite
      const glowSize = radius * (star.distance === 0 ? 18 : 10);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(star.color),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(glowMat);
      sprite.scale.setScalar(glowSize);
      sprite.position.copy(pos);
      this.starGroup.add(sprite);
      this.glowSprites.set(star.id, sprite);

      // Label sprite for nearby stars
      if (star.distance < 50 || ['Vega', 'Arcturus', 'Betelgeuse', 'Rigel', 'Sirius A', 'Canopus'].includes(star.name)) {
        this.addLabel(star, pos, radius);
      }
    }
  }

  private addLabel(star: StarData, pos: THREE.Vector3, radius: number) {
    const c = document.createElement('canvas');
    c.width = 380; c.height = 54;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 380, 54);
    ctx.font = '600 16px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(200, 220, 255, 0.9)';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,50,150,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(star.name, 160, 28);

    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    const labelOffset = radius + 3.5;
    sprite.position.set(pos.x, pos.y + labelOffset, pos.z);
    sprite.scale.set(20, 4, 1);
    this.starGroup.add(sprite);
  }

  private startRender() {
    const tick = () => {
      this.animationId = requestAnimationFrame(tick);

      // Smooth rotation
      this.rotationX += (this.targetRotX - this.rotationX) * 0.07;
      this.rotationY += (this.targetRotY - this.rotationY) * 0.07;

      // Smooth zoom
      this.zoom += (this.targetZoom - this.zoom) * 0.08;
      this.camera.position.z = 250 / this.zoom;

      // Apply rotation to star + grid group
      this.starGroup.rotation.x = this.rotationX;
      this.starGroup.rotation.y = this.rotationY;
      this.gridGroup.rotation.x = this.rotationX;
      this.gridGroup.rotation.y = this.rotationY;

      // Pulse the hovered star
      if (this.hoveredStar !== null) {
        const mesh = this.starMeshes.get(this.hoveredStar);
        if (mesh) {
          const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.1;
          mesh.scale.setScalar(pulse * 1.3);
        }
      }

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private bindEvents() {
    const canvas = this.canvasRef.nativeElement;

    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.prevMouse.x;
        const dy = e.clientY - this.prevMouse.y;
        this.targetRotY += dx * 0.005;
        this.targetRotX += dy * 0.005;
        this.targetRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetRotX));
        this.prevMouse = { x: e.clientX, y: e.clientY };
      } else {
        // Hover detection
        const rect = canvas.getBoundingClientRect();
        this.mouse2d.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse2d.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.checkHover();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse2d.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse2d.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.checkClick();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.targetZoom = Math.max(0.3, Math.min(8, this.targetZoom * delta));
    }, { passive: false });

    // Touch support
    let lastTouchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.prevMouse.x;
        const dy = e.touches[0].clientY - this.prevMouse.y;
        this.targetRotY += dx * 0.005;
        this.targetRotX += dy * 0.005;
        this.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = dist / lastTouchDist;
        this.targetZoom = Math.max(0.3, Math.min(8, this.targetZoom * delta));
        lastTouchDist = dist;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { this.isDragging = false; });

    // Resize
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(canvas);
  }

  private getMeshesForRaycast(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.starMeshes.forEach(m => meshes.push(m));
    return meshes;
  }

  private checkHover() {
    this.raycaster.setFromCamera(this.mouse2d, this.camera);
    const hits = this.raycaster.intersectObjects(this.getMeshesForRaycast());

    // Reset previous hover
    if (this.hoveredStar !== null) {
      const prev = this.starMeshes.get(this.hoveredStar);
      if (prev) prev.scale.setScalar(1);
    }

    if (hits.length > 0) {
      const id = hits[0].object.userData['starId'] as number;
      this.hoveredStar = id;
      this.canvasRef.nativeElement.style.cursor = 'pointer';
    } else {
      this.hoveredStar = null;
      this.canvasRef.nativeElement.style.cursor = this.isDragging ? 'grabbing' : 'grab';
    }
  }

  private checkClick() {
    this.raycaster.setFromCamera(this.mouse2d, this.camera);
    const hits = this.raycaster.intersectObjects(this.getMeshesForRaycast());
    if (hits.length > 0) {
      const id = hits[0].object.userData['starId'] as number;
      const star = STAR_DATA.find(s => s.id === id) ?? null;
      this.ngZone.run(() => this.starSelected.emit(star));
    }
  }

  private onResize() {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
