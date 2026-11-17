import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

export class MouseScene {
  constructor(container, overlays, onSelect) {
    this.container=container; this.overlays=overlays; this.onSelect=onSelect;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(33,1,.1,100);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000,0);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.45;
    container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.controls.enablePan = false;
    this.controls.minDistance=6.5;this.controls.maxDistance=15;
    this.controls.minPolarAngle=.04;this.controls.maxPolarAngle=Math.PI*.48;
    this.controls.target.set(-.15,.55,0);
    this.scene.add(new THREE.HemisphereLight(0xf2f7f7,0x4d5557,2.1));
    const key=new THREE.DirectionalLight(0xffffff,4.4);key.position.set(-3,7,-4);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.normalBias=.04;key.shadow.radius=5;this.scene.add(key);
    const rim=new THREE.DirectionalLight(0xe5f2f0,2.8);rim.position.set(4,3,3);this.scene.add(rim);
    const fill=new THREE.DirectionalLight(0xffffff,1.2);fill.position.set(-5,1,3);this.scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:0x0e1415,opacity:.32}));floor.rotation.x=-Math.PI/2;floor.position.y=-.07;floor.receiveShadow=true;this.scene.add(floor);
    this.group=new THREE.Group();this.scene.add(this.group);this.targets={};this.markers=[];
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown',e=>{this.down=[e.clientX,e.clientY]});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!this.down||Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>5)return;
      const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hit=this.raycaster.intersectObjects(this.group.children,true)[0];
      if(hit?.object.userData.button)this.onSelect(hit.object.userData.button);
    });
    this.controls.addEventListener('change', () => this.requestRender());
    this.setView('perspective');
    this.resize();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (!this.width || !this.height) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.positionMarkers();
    });
  }

  resize() {
    const {width, height} = this.container.getBoundingClientRect();
    this.width = width;
    this.height = height;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 1 ? 40 : 34;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender();
  }
  material(color,metalness=.05,roughness=.57){return new THREE.MeshStandardMaterial({color,metalness,roughness})}
  mesh(geometry,material,position=[0,0,0],button=null){const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.castShadow=true;m.receiveShadow=true;if(button){m.userData.button=button;(this.targets[button]??=[]).push(m)}this.group.add(m);return m}
  ellipsoid(position,scale,material,button){const mesh=this.mesh(new THREE.SphereGeometry(1,64,40),material,position,button);mesh.scale.set(...scale);return mesh}
  shape(points,depth,material,y,button){const s=new THREE.Shape();s.moveTo(...points[0]);for(const p of points.slice(1))s.lineTo(...p);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:.07,bevelSize:.09,bevelSegments:5,steps:1});g.rotateX(-Math.PI/2);return this.mesh(g,material,[0,y,0],button)}
  build(model,buttons){
    for (const child of [...this.group.children]) {
      child.traverse(mesh => {
        mesh.geometry?.dispose();
        mesh.material?.map?.dispose();
        mesh.material?.dispose();
      });
      this.group.remove(child);
    }
    this.targets={};this.markers=[];this.overlays.replaceChildren();this.model=model;
    const dark=this.material(model==='mx4'?0x373c3e:0x434749,.12,.58),base=this.material(0x25282a,.05,.7),rubber=this.material(0x323638,.02,.83),metal=this.material(0xa6adb0,.7,.3);
    // Ergonomic shell: asymmetric sampled surface, with a broad left thumb shelf.
    this.shape([[-.7,1.95],[.65,1.95],[1,1.6],[1.15,.9],[1.13,-.65],[.83,-1.8],[.35,-2.15],[-.65,-2.1],[-1.13,-1.7],[-1.48,-.9],[-1.68,.1],[-1.68,.65],[-1.35,1]],.15,base,.06);
    const body=new THREE.SphereGeometry(1,96,64);const pos=body.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      const rear=(z+1)/2;
      pos.setXYZ(i,x*(1.04+.08*rear)+.09*y,.81+y*(.66+.21*rear),z*2.04);
    }body.computeVertexNormals();this.mesh(body,dark,[0,0,0]);
    this.ellipsoid([-.92,.39,.4],[.8,.3,1.2],rubber,model==='mx4'?'thumb':'gesture');
    // Curved click plates conform to the top of the body.
    const top=(x,z)=>{const xn=(x-.07)/1.08,zn=z/2.04;return .81+Math.sqrt(Math.max(.005,1-xn*xn-zn*zn))*(.66+.21*(zn+1)/2)};
    const plate=(left)=>{
      const vertices=[],indices=[];const nx=18,nz=28;
      for(let j=0;j<=nz;j++){const z=-1.91+j/nz*1.7;const maxX=Math.sqrt(Math.max(0,1-(z/2.04)**2))*1.05;
        for(let i=0;i<=nx;i++){const u=i/nx;const x=left?-.035-u*(maxX-.07):.13+u*(maxX-.15);vertices.push(x,top(x,z)+.028,z)}
      }
      for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2)}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const mat=this.material(left?0x3d3e45:0x414249,.12,.49);mat.side=THREE.DoubleSide;this.mesh(g,mat,[0,0,0],left?'left':'right');
    };plate(true);plate(false);
    // MagSpeed wheel, metallic ribs, recessed channel and mode switch.
    this.ellipsoid([.035,1.28,-1.02],[.19,.1,.52],base);
    const wheel=this.mesh(new THREE.CylinderGeometry(.285,.285,.24,64),metal,[.035,1.43,-1.02],'middle');wheel.rotation.z=Math.PI/2;
    for(let i=0;i<36;i++){const a=i/36*Math.PI*2;const rib=this.mesh(new THREE.BoxGeometry(.249,.014,.025),this.material(0xd2d4d8,.8,.25),[.035,1.43+Math.cos(a)*.285,-1.02+Math.sin(a)*.285],'middle');rib.rotation.x=-a;}
    this.ellipsoid([.035,1.52,-.26],[.14,.055,.205],this.material(0x66646d,.45,.4),'shift');
    // Thumb wheel and the two navigation buttons.
    const thumbWheel=this.mesh(new THREE.CylinderGeometry(.18,.18,.53,48),metal,[-1.02,1.05,-.55]);thumbWheel.rotation.x=Math.PI/2;thumbWheel.rotation.z=-.3;
    for(let i=0;i<12;i++){const ring=this.mesh(new THREE.TorusGeometry(.182,.009,5,32),this.material(0xd0d1d5,.8,.3),[-1.02,1.05,-.79+i*.044]);ring.rotation.y=-.2}
    const forward=this.ellipsoid([-1.102,.84,-.05],[.085,.105,.225],this.material(0x4e4c56,.2,.4),'forward');forward.rotation.z=-.3;
    const back=this.ellipsoid([-1.12,.75,.43],[.085,.105,.225],this.material(0x4e4c56,.2,.4),'back');back.rotation.z=-.3;
    const gesture=model==='mx4'?[-1.11,.62,.84]:[-1.48,.48,.25];
    this.ellipsoid(gesture,model==='mx4'?[.1,.08,.16]:[.2,.04,.38],this.material(0x434149,.05,.7),'gesture');
    if(model==='mx4'){
      this.ellipsoid([-1.45,.49,.1],[.23,.055,.55],this.material(0x48454f,.05,.65),'thumb');
      for(let i=0;i<5;i++)this.ellipsoid([-1.48+i*.047,.55,.1],[.012,.006,.2],this.material(0x62596e,.1,.7),'thumb');
    }
    // Fine grip grooves follow the thumb support; subtle branding on the palm.
    for(let i=0;i<15;i++){
      const pts=[];for(let j=0;j<=20;j++){const t=j/20;pts.push(new THREE.Vector3(-1.08-.4*Math.sin(t*Math.PI*.8),.32+.08*Math.sin(t*Math.PI),-.5+i*.065+t*.4))}
      this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),20,.008,4,false),this.material(0x57525f,.02,.9));
    }
    const logoCanvas=document.createElement('canvas');logoCanvas.width=256;logoCanvas.height=128;const ctx=logoCanvas.getContext('2d');ctx.fillStyle='#b4afba';ctx.font='600 60px Arial';ctx.textAlign='center';ctx.fillText('logi',128,78);const texture=new THREE.CanvasTexture(logoCanvas);const logo=new THREE.Mesh(new THREE.PlaneGeometry(.51,.255),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.42,depthWrite:false}));logo.position.set(.13,1.575,.64);logo.rotation.x=-Math.PI/2;this.group.add(logo);
    this.ellipsoid([-.52,1.28,-1.23],[.018,.015,.04],new THREE.MeshStandardMaterial({color:0x9acaac,emissive:0x83bb90,emissiveIntensity:.3}));
    const anchors={left:[-.53,top(-.53,-1.24)+.09,-1.24],right:[.62,top(.62,-1.2)+.09,-1.2],middle:[.035,1.77,-1.02],shift:[.035,1.62,-.22],back:[-1.25,.85,.43],forward:[-1.22,.94,-.08],gesture:gesture.map((n,i)=>n+(i===1?.09:0)),thumb:[-1.54,.59,-.02]};
    buttons.forEach((button, index) => {
      const el = document.createElement('button');
      const leader = document.createElement('span');
      leader.className = 'hotspot-leader';
      leader.setAttribute('aria-hidden', 'true');
      leader.hidden = true;
      el.className = 'hotspot';
      el.textContent = index + 1;
      el.title = button.label;
      el.setAttribute('aria-label', `Selecionar ${button.label}`);
      el.onclick = () => this.onSelect(button.id);
      this.overlays.append(leader, el);
      this.markers.push({id: button.id, el, leader, position: new THREE.Vector3(...anchors[button.id])});
    });
    this.select(this.selected||'gesture');
  }
  select(id) {
    this.selected = id;
    for (const [key, meshes] of Object.entries(this.targets)) {
      for (const mesh of meshes) {
        mesh.material.emissive?.set(key === id ? 0x28715d : 0x000000);
        mesh.material.emissiveIntensity = key === id ? .34 : 0;
      }
    }
    for (const marker of this.markers) {
      const selected = marker.id === id;
      marker.el.classList.toggle('selected', selected);
      marker.el.setAttribute('aria-pressed', selected);
    }
    this.requestRender();
  }

  positionMarkers() {
    const visible = [];
    for (const marker of this.markers) {
      const point = marker.position.clone().project(this.camera);
      marker.el.hidden = point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      marker.leader.hidden = true;
      if (marker.el.hidden) continue;
      const anchorX = (point.x * .5 + .5) * this.width;
      const anchorY = (-point.y * .5 + .5) * this.height;
      visible.push({marker, anchorX, anchorY, x: anchorX, y: anchorY});
    }

    // Separate nearby markers while keeping their projected button positions as anchors.
    const spacing = 36;
    for (let pass = 0; pass < 10; pass++) {
      for (const [index, first] of visible.entries()) {
        for (const next of visible.slice(index + 1)) {
          const dx = next.x - first.x;
          const dy = next.y - first.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= spacing) continue;
          const push = (spacing - distance) / 2;
          const x = distance ? dx / distance * push : push;
          const y = distance ? dy / distance * push : 0;
          first.x -= x;
          first.y -= y;
          next.x += x;
          next.y += y;
        }
      }
    }

    for (const {marker, anchorX, anchorY, x, y} of visible) {
      const centerX = THREE.MathUtils.clamp(x, 14, this.width - 14);
      const centerY = THREE.MathUtils.clamp(y, 14, this.height - 14);
      marker.el.style.left = centerX + 'px';
      marker.el.style.top = centerY + 'px';
      const dx = centerX - anchorX;
      const dy = centerY - anchorY;
      const length = Math.hypot(dx, dy);
      if (length < 12) continue;
      marker.leader.hidden = false;
      marker.leader.style.left = anchorX + 'px';
      marker.leader.style.top = anchorY + 'px';
      marker.leader.style.width = length + 'px';
      marker.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
  }

  setView(view) {
    const views = {perspective: [-5.9, 5.8, -7.4], top: [-.15, 10.6, .01], side: [-10.8, 3.8, .8]};
    this.camera.position.set(...views[view]);
    this.controls.target.set(-.15, .55, 0);
    this.controls.update();
    this.requestRender();
  }
}
