shader_type canvas_item;
uniform float time=0.0;
uniform float strength=1.0;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p); vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void fragment(){
 vec2 p=UV;
 float cloud=noise(p*vec2(5.0,8.0)+vec2(time*0.015,-time*0.009));
 float wisps=noise(p*vec2(11.0,5.0)+vec2(-time*0.024,0.0));
 float mist=smoothstep(0.44,0.86,cloud*0.6+wisps*0.4)*(0.04+pow(p.y,3.0)*0.16)*strength;
 float edge=smoothstep(0.32,0.72,length((p-0.5)*vec2(1.0,0.86)))*0.30;
 float grain=(hash(p*vec2(1440,900)+floor(time*8.0))-0.5)*0.012;
 COLOR=vec4(mix(vec3(0.09,0.13,0.145),vec3(0.52,0.59,0.56),mist*4.0),edge+mist+grain);
}
