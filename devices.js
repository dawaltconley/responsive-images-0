const devices = [
    {
        w: 2560,
        h: 1600,
        dppx: [ 1 ],
        flip: false },
    {
        w: 1920,
        h: 1200,
        dppx: [ 1 ],
        flip: false },
    {
        w: 1680,
        h: 1050,
        dppx: [ 1 ],
        flip: false },
    {
        w: 1440,
        h: 900,
        dppx: [ 2, 1 ],
        flip: false },
    {
        w: 1366,
        h: 1024,
        dppx: [ 2, 1 ],
        flip: true },
    {
        w: 1280,
        h: 800,
        dppx: [ 2, 1.5, 1 ],
        flip: true },
    {
        w: 1024,
        h: 768,
        dppx: [ 2, 1 ],
        flip: true },
    {
        w: 960,
        h: 600,
        dppx: [ 3, 2 ],
        flip: true },
    {
        w: 800,
        h: 600,
        dppx: [ 1 ],
        flip: false },
    {
        w: 768,
        h: 432,
        dppx: [ 4, 3, 2.5 ],
        flip: true },
    {
        w: 690,
        h: 412,
        dppx: [ 3.5, 2 ],
        flip: true },
    {
        w: 640,
        h: 360,
        dppx: [ 4, 3, 2, 1.5 ],
        flip: true },
    {
        w: 480,
        h: 320,
        dppx: [ 3, 2.4, 2, 1.5, 1 ],
        flip: true }
];

let imageSizes = [];

// function addImageSize(device, images=imageSizes) {
//     device.dppx.forEach(dppx => {
//         const w = device.w * dppx, h = device.h * dppx;
//         const match = imageSizes.find(i => i.w === w && i.h === h);
//         if (!match) {
//             imageSizes.push({
//                 w: w,
//                 h: h,
//             });
//         }
//     });
//     if (device.flip) {
//         addImageSize({
//             ...device,
//             w: device.h,
//             h: device.w,
//             flip: false
//         }, images);
//     }
// }

function addImageSize (d) {
    d.dppx.forEach(dppx => {
        const w = d.w * dppx, h = d.h * dppx;
        const match = imageSizes.find(i => i.w === w && i.h === h);
        if (match) {
            match.flip = match.flip || d.flip;
        } else {
            imageSizes.push({
                w: w,
                h: h,
                flip: d.flip
            });
        }
    });
}

devices.forEach(d => addImageSize(d));
imageSizes.sort((a, b) => b.w !== a.w ? b.w - a.w : b.h - a.h);

module.exports = {
    devices: devices,
    images: imageSizes
};

console.log(imageSizes);
