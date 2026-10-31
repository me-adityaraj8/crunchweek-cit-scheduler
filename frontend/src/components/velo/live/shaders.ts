// GLSL for Velo's orb. Simplex noise is Ashima Arts' 3D simplex noise (MIT), the usual one.

export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

// The body: a sphere pushed in and out by flowing noise. Normals are rebuilt from two neighbours so the
// light follows the deformation.
export const ORB_VERT = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform float uFreq;
varying vec3 vNormal; varying vec3 vView; varying vec3 vObj; varying float vDisp;
${NOISE}
float field(vec3 p){
  return snoise(p*uFreq+vec3(0.0,uTime*0.35,uTime*0.2))*0.75+snoise(p*uFreq*1.9-vec3(uTime*0.45))*0.14;
}
vec3 bend(vec3 p){ return p+normalize(p)*field(p)*uAmp; }
void main(){
  vec3 n=normalize(position);
  vec3 t=normalize(cross(n,abs(n.y)<0.99?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0)));
  vec3 b=normalize(cross(n,t));
  vec3 p0=bend(position); vec3 p1=bend(position+t*0.02); vec3 p2=bend(position+b*0.02);
  vec3 nn=normalize(cross(p1-p0,p2-p0));
  if(dot(nn,n)<0.0) nn=-nn;
  vNormal=normalize(normalMatrix*nn); vObj=position; vDisp=field(position)*uAmp;
  vec4 mv=modelViewMatrix*vec4(p0,1.0); vView=-mv.xyz;
  gl_Position=projectionMatrix*mv;
}
`;

// Colour is a field flowing across the surface: violet into pink, deep purple underneath, amber on the
// lower edge. Soft key light, a specular highlight, a bright rim, and energy on the crests.
export const ORB_FRAG = /* glsl */ `
uniform float uTime; uniform float uGlow; uniform float uEnergy; uniform float uSat;
uniform vec3 uPink; uniform vec3 uViolet; uniform vec3 uDeep; uniform vec3 uAmber;
varying vec3 vNormal; varying vec3 vView; varying vec3 vObj; varying float vDisp;
${NOISE}
void main(){
  vec3 N=normalize(vNormal); vec3 V=normalize(vView);
  float f1=snoise(vObj*1.25+vec3(uTime*0.22,-uTime*0.17,uTime*0.11));
  float f2=snoise(vObj*2.3-vec3(uTime*0.29));
  // magenta core, violet flank (upper left), deep purple underneath, amber glowing low on the right
  vec3 col=mix(uPink,uViolet,smoothstep(-0.2,0.9,-vObj.x*0.7+vObj.y*0.35+f1*0.45));
  col=mix(col,uDeep,smoothstep(0.15,1.0,-vObj.y*0.8+f2*0.3)*0.7);
  col=mix(col,uAmber,smoothstep(0.35,1.0,vObj.x*0.6-vObj.y*0.55+f1*0.4)*0.75);
  vec3 L=normalize(vec3(-0.45,0.65,0.85));
  float diff=max(dot(N,L),0.0);
  float fres=pow(1.0-max(dot(N,V),0.0),2.0);
  vec3 H=normalize(L+V);
  float gloss=pow(max(dot(N,H),0.0),70.0)*0.85+pow(max(dot(N,H),0.0),9.0)*0.16;
  col*=0.42+0.78*diff;
  col+=gloss*vec3(1.0,0.92,0.98);
  col+=fres*mix(uPink,vec3(1.0,0.8,0.95),0.45)*(0.45+uGlow*0.7);
  col+=mix(uPink,uAmber,0.4)*max(vDisp,0.0)*uEnergy*2.2;
  float g=dot(col,vec3(0.299,0.587,0.114));
  col=mix(vec3(g),col,uSat*1.18);
  gl_FragColor=vec4(max(col,0.0),1.0);
  #include <colorspace_fragment>
}
`;

// A soft coloured glow behind the orb. Normal blending, so it shows on concrete as well as on night.
export const HALO_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`;
export const HALO_FRAG = /* glsl */ `
uniform float uGlow; uniform float uTime; uniform vec3 uPink; uniform vec3 uViolet; uniform float uStrength;
varying vec2 vUv;
void main(){
  vec2 p=vUv-0.5; float r=length(p)*2.0;
  float a=smoothstep(1.0,0.2,r)*(0.3+uGlow*0.45)*uStrength;
  vec3 col=mix(uViolet,uPink,0.5+0.5*sin(atan(p.y,p.x)*2.0+uTime*0.6));
  gl_FragColor=vec4(col,a*a*1.4+a*0.18);
  #include <colorspace_fragment>
}
`;

// One eye, drawn as a distance field so its shape can blend: a rounded pill that closes for a blink,
// an arc for a smile, a flat line for an error, and a squint.
export const EYE_FRAG = /* glsl */ `
uniform float uOpen; uniform float uHappy; uniform float uFlat; uniform float uSquint; uniform float uTilt;
varying vec2 vUv;
float pill(vec2 p,float h,float r){ p.y-=clamp(p.y,-h,h); return length(p)-r; }
float drop(vec2 p,float h,float r){ float k=clamp(p.y,-h,h); return length(vec2(p.x,p.y-k))-r*mix(1.0,0.55,smoothstep(-h,h,k)); }
void main(){
  vec2 p=(vUv-0.5)*vec2(1.0,1.45);
  float c=cos(uTilt), s=sin(uTilt); p=mat2(c,-s,s,c)*p;
  float h=mix(0.004,0.17,uOpen)*(1.0-uSquint*0.62);
  float eye=drop(p,h,0.115);
  float arc=max(abs(length(p-vec2(0.0,-0.13))-0.17)-0.045,-(p.y+0.02));
  float line=pill(vec2(p.y,p.x),0.1,0.04);
  float d=mix(mix(eye,arc,uHappy),line,uFlat);
  float a=1.0-smoothstep(-0.008,0.008,d);
  gl_FragColor=vec4(vec3(1.0,0.97,1.0),a);
}
`;

// Voice mode: thin energy rings with travelling bright segments.
export const RING_FRAG = /* glsl */ `
uniform float uTime; uniform float uLevel; uniform vec3 uPink; uniform vec3 uViolet; uniform float uSeed;
varying vec2 vUv;
void main(){
  float a=vUv.x*6.28318;
  float seg=0.5+0.5*sin(a*3.0+uTime*(1.2+uSeed)+uSeed*4.0);
  seg=pow(seg,6.0);
  vec3 col=mix(uViolet,uPink,seg);
  float alpha=0.16+seg*(0.55+uLevel*0.8);
  gl_FragColor=vec4(col*(1.0+uLevel),alpha);
  #include <colorspace_fragment>
}
`;

// Voice mode: particles drifting on a shell, pushed outward by sound.
export const PARTICLE_VERT = /* glsl */ `
uniform float uTime; uniform float uLevel; uniform float uSize;
attribute float aSeed;
varying float vAlpha;
void main(){
  vec3 p=position;
  float ang=uTime*(0.05+aSeed*0.08);
  float c=cos(ang), s=sin(ang);
  p.xz=mat2(c,-s,s,c)*p.xz;
  p*=1.0+uLevel*0.35*aSeed+0.04*sin(uTime*0.8+aSeed*20.0);
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_PointSize=uSize*(0.6+aSeed)*(1.0/-mv.z);
  vAlpha=0.25+0.6*aSeed;
  gl_Position=projectionMatrix*mv;
}
`;
export const PARTICLE_FRAG = /* glsl */ `
uniform vec3 uPink; uniform vec3 uViolet; uniform float uLevel;
varying float vAlpha;
void main(){
  float r=length(gl_PointCoord-0.5)*2.0;
  float a=smoothstep(1.0,0.0,r)*vAlpha*(0.55+uLevel*0.6);
  gl_FragColor=vec4(mix(uViolet,uPink,vAlpha),a);
  #include <colorspace_fragment>
}
`;
