shader_type spatial;
render_mode diffuse_burley, cull_disabled;
uniform sampler2D paving : source_color, repeat_enable, filter_linear_mipmap;
varying vec3 world_position;

float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
 vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
 vec2 p=world_position.xz;
 float n=noise(p*1.2)*0.5+noise(p*4.5)*0.3+noise(p*18.0)*0.2;
 vec3 earth=mix(vec3(0.19,0.225,0.21),vec3(0.32,0.32,0.26),n);
 float edge_noise=noise(p*1.7)*0.55;
 float street=1.0-smoothstep(2.6,3.3,abs(p.y-3.0)+edge_noise);
 float plaza=1.0-smoothstep(5.3,6.1,length((p-vec2(0,1.0))*vec2(0.92,1.0))+edge_noise);
 float alley=(1.0-smoothstep(1.45,2.15,abs(p.x)+edge_noise))*(1.0-smoothstep(-6.5,-5.8,-p.y));
 vec3 stone=texture(paving,p/8.5).rgb*vec3(0.74,0.81,0.81);
 float doorstep=max(1.0-smoothstep(1.1,1.7,abs(p.x+8.5)+edge_noise),1.0-smoothstep(1.05,1.75,abs(p.x-8.0)+edge_noise));
 doorstep*=smoothstep(-4.0,-3.0,p.y)*(1.0-smoothstep(3.4,4.0,p.y));
 float paved=max(max(max(street,plaza),alley),doorstep);
 float wet=(1.0-smoothstep(0.13,0.27,noise(p*0.85)))*paved;
 ALBEDO=mix(earth,stone,paved)*(1.0-wet*0.18);
 ROUGHNESS=0.91-wet*0.3;
}
