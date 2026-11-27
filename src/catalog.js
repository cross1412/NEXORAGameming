export const categories = [
  ['Mouse','เมาส์เกมมิ่ง'], ['Keyboard','คีย์บอร์ด'], ['Headset','หูฟังเกมมิ่ง'],
  ['Monitor','จอมอนิเตอร์'], ['Chair','เก้าอี้เกมมิ่ง'], ['Desk','โต๊ะเกมมิ่ง'],
  ['Controller','จอยและคอนโทรลเลอร์'], ['Microphone','ไมโครโฟน'], ['Speakers','ลำโพง'],
  ['Accessories','อุปกรณ์เสริม'], ['PC Components','ฮาร์ดแวร์และคอนโซล']
];

const brandNames = ['Logitech','Razer','Keychron','HyperX','ASUS','BenQ','SteelSeries','Corsair','Sony','Nintendo'];
const namesByCategory = {
  Mouse:['G PRO X SUPERLIGHT 2','Viper V3 Pro','ROG Harpe Ace','DeathAdder V3','MX Master 4','M75 Air','Model D 2','G502 X Plus','Basilisk V3','Strider Wireless'],
  Keyboard:['K2 Pro Mechanical','Huntsman V3 Pro','BlackWidow V4','G Pro X TKL','Apex Pro TKL','K70 RGB','Keychron Q1 HE','ROG Azoth','MX Mechanical','Vulcan II Mini'],
  Headset:['Cloud III','Arctis Nova 7','BlackShark V2 Pro','G733 LIGHTSPEED','Barracuda X','Void Wireless','HS80 RGB','A30 Wireless','Quantum 910','Vega Pro'],
  Monitor:['ROG Swift OLED','Alienware AW2725DF','Mag 27CQ6F','XL2566X+','XG27AQDMG','Odyssey OLED G8','Predator X27','UltraGear 27GR95','MOBIUZ EX2710','ROG Strix XG43'],
  Chair:['Titan Evo','Lich King','T1 RACE','Secretlab Lite','Dxracer King','Aero 2','Noblechairs Hero','Corsair TC200','Herman Miller','Anda Seat Kaiser 4'],
  Desk:['Neon Craft Desk','L-Shape Elite','Apex Standing','War Table','Pro RGB Desk','Classic Oak','Flexi Height','Mission 120','Zephyr Desk','Titan Frame'],
  Controller:['DualSense Edge','Elite Series 2','DualShock 5','Xbox Core','8BitDo Ultimate','ROG Raikiri','Vader 4 Pro','Victrix Pro','GuliKit TMR','Flydigi Apex 4'],
  Microphone:['Wave Neo','QuadCast 2','MV7+','Elgato Wave 3','Aorus Mic','Seiren V3','Shure MV6','Maono DM30','Blue Yeti X','Razer Raptor'],
  Speakers:['Harman Kardon Aura','Kanto YU6','Logitech G560','Creative Pebble','Kicker X3','Edifier G2000','Razer Leviathan','SteelSeries Arena','Audioengine A2','JBL Quantum Duo'],
  Accessories:['Mousepad Desk XL','USB-C 8-in-1','RGB Stream Deck','Cable Sleeve','Wrist Rest','Webcam Kiyo','Arm Mount','Grip Tape','Capture Card','Mouse Bungee'],
  'PC Components':['RTX 5090','Ryzen 9 9950X','GeForce RTX 4080','Z790 Motherboard','HX1000 PSU','H150i Cooler','DDR5 64GB','MP700 SSD','Nova Mesh Case','PS5 Pro']
};

const productImageConfig = {
  ACC: { prefix: 'acc', extension: 'png' },
  CHA: { prefix: 'cha', extension: i => i < 9 ? 'webp' : 'png' },
  CON: { prefix: 'con', extension: 'png' },
  DES: { prefix: 'des', extension: 'png' },
  HEA: { prefix: 'hea', extension: 'webp' },
  KEY: { prefix: 'key', extension: 'webp' },
  MIC: { prefix: 'mic', extension: 'png' },
  MON: { prefix: 'mon', extension: 'webp' },
  MOU: { prefix: 'mou', extension: 'webp' },
  PC: { prefix: 'pc', extension: 'png' },
  SPK: { prefix: 'spk', extension: 'png' }
};
const categoryImageCode = ['MOU','KEY','HEA','MON','CHA','DES','CON','MIC','SPK','ACC','PC'];

export const products = categories.flatMap(([category], ci) =>
  Array.from({ length: 10 }, (_, i) => {
    const rank = i % 7 === 0 ? 'S' : i % 3 === 0 ? 'A' : i % 2 === 0 ? 'B' : 'C';
    const price = 1290 + ((ci * 1379 + i * 847) % 32000);
    const imageCode = categoryImageCode[ci];
    const imageConfig = productImageConfig[imageCode];
    const extension = typeof imageConfig.extension === 'function'
      ? imageConfig.extension(i + 1)
      : imageConfig.extension;
    return {
      id: ci * 10 + i + 1,
      sku: `NXG-${imageCode}-${String(i + 1).padStart(3,'0')}`,
      category,
      name: namesByCategory[category][i],
      brand: brandNames[(ci + i) % brandNames.length],
      price,
      oldPrice: i % 4 === 0 ? price + 1500 : null,
      rank,
      image: `/products/nxg-${imageConfig.prefix}-${String(i + 1).padStart(3,'0')}.${extension}`,
      stats: { speed: 65 + i * 3, precision: 72 + i * 2, durability: 68 + i * 2, value: 74 + i },
      pros: ['คุณภาพระดับพรีเมียม','รับประกันศูนย์ไทย','ส่งไวภายใน 24 ชั่วโมง'],
      cons: ['ไม่มีอุปกรณ์เสริมเสริมแถม','ต้องลงไดรเวอร์บางรุ่น']
    };
  })
);
