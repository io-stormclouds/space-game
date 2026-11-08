// Muted terrain tones derived from KayKit material colours with the project's muteBodyColor math (palette.ts:110-114)
const hexToRgb=h=>({r:((h>>16)&255)/255,g:((h>>8)&255)/255,b:(h&255)/255});
const rgbToHex=c=>{const ch=v=>Math.max(0,Math.min(255,Math.round(v*255)));return (ch(c.r)<<16)|(ch(c.g)<<8)|ch(c.b);};
const mix=(a,b,t)=>{const x=hexToRgb(a),y=hexToRgb(b);return rgbToHex({r:x.r+(y.r-x.r)*t,g:x.g+(y.g-x.g)*t,b:x.b+(y.b-x.b)*t});};
const luma=h=>{const{r,g,b}=hexToRgb(h);return 0.2126*r+0.7152*g+0.0722*b;};
const METAL=0x3b4756;
const mute=(h,g=0.55,m=0.25)=>{const l=luma(h);const grey=rgbToHex({r:l,g:l,b:l});return mix(mix(h,grey,g),METAL,m);};
const css=h=>'#'+h.toString(16).padStart(6,'0');
// KayKit materials (sRGB from baseColorFactor)
const K={Green:0x4aba8c,GreenDark:0x2c8a8c,Brown:0xc7845f,BrownDark:0x995a46,Beige:0xd9ad7d,White:0xe6e6e6,Water:0x4ad5e0,Stone:0x788287,StoneDark:0x5a6164,Metal:0xa8b6bd,Yellow:0xffbb29,Red:0xff3061,Black:0x2b3539,WoodDark:0x6d605c};
console.log('material  kaykit   mute(0.55,0.25)  mute(0.4,0.2) ');
for (const [n,h] of Object.entries(K)) console.log(n.padEnd(10), css(h), css(mute(h)).padEnd(16), css(mute(h,0.4,0.2)));
// body colours of Tau Ceti planets muted (what the grid shows today)
const bodies={b:0xb0724a,c:0x9a8a78,d:0x8b8f96,e:0x4f7a5a,f:0xa9c4d6,matka:0x3b82f6,moon:0x9ca3af};
console.log('\nbody colours muted today:'); for (const [n,h] of Object.entries(bodies)) console.log(n.padEnd(6), css(h), '->', css(mute(h)));
// proposed terrain tones (hand-tuned targets): start from KayKit, mute 0.4/0.2 so terrain stays readable
const T={grass:K.Green, forest:K.GreenDark, sand:K.Beige, rock:K.Brown, soil:K.BrownDark, snow:K.White, ice:0xbfe3ea, water:K.Water, stone:K.Stone, stoneDark:K.StoneDark, wood:K.BrownDark, roof:K.Brown, thatch:K.Yellow, road:K.Beige};
console.log('\nproposed terrain tones (mute 0.4/0.2):'); for (const [n,h] of Object.entries(T)) console.log(n.padEnd(10), css(h), '->', css(mute(h,0.4,0.2)), 'luma', luma(mute(h,0.4,0.2)).toFixed(2));
