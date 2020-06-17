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
        dppx: [ 3, 2, 1 ],
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
        // dppx: [ 3, 2.4, 2, 1.5, 1 ],
        dppx: [ 4, 3, 2, 1.5, 1 ],
        flip: true }
];

const images = [ // also make a version of each image in portrait with crop set to true
    { w: 3072, h: 1728 },
    { w: 2880, h: 1800 },
    { w: 2732, h: 2048 },
    { w: 2560, h: 1600 },
    // { w: 2560, h: 1440 },
    // { w: 2415, h: 1442 },
    // { w: 2304, h: 1296 },
    { w: 2048, h: 1536 },
    { w: 1920, h: 1280 },
    // { w: 1920, h: 1080 },
    // { w: 1680, h: 1050 },
    { w: 1440, h: 960 },
    // { w: 1440, h: 900 },
    // { w: 1380, h: 824 },
    // { w: 1366, h: 1024 },
    { w: 1280, h: 800 },
    // { w: 1280, h: 720 },
    // { w: 1152, h: 768 },
    { w: 1024, h: 768 },
    { w: 960, h: 640 },
    // { w: 960, h: 540 },
    // { w: 800, h: 600 },
    { w: 720, h: 480 },
    { w: 480, h: 320 }
];

// add an argument to mixin to indicate whether bg image should 'match orientation', aka, crop using height / width when vertical

const queries = {
    landscape: [],
    portrait: []
};

devices.forEach(d => {
    d.dppx.forEach(dppx => {
        const w = d.w * dppx, h = d.h * dppx;
        const image = images.sort((a, b) => b.w - a.w).find((img, i, array) => {
            const next = array[i + 1];
            return !next
                || w <= next.w && h > next.h && h <= img.h
                || w <= img.w && w > next.w;
        });
        if (w > image.w)
            console.log(`warning: image width too small for query ${d.w}x${d.h}x${dppx}`);
        if (h > image.h)
            console.log(`warning: image height too small for query ${d.w}x${d.h}x${dppx}`);
        queries.landscape.push({
            w: d.w,
            h: d.h,
            dppx: dppx,
            image: image
            // image: `${image.w}x${image.h}`
        });
        if (d.flip) {
            queries.portrait.push({
                w: d.h,
                h: d.w,
                dppx: dppx,
                image: { w: image.h, h: image.w }
                // image: `${image.h}x${image.w}`
            })
        }
    });
});

module.exports = {
    devices: devices,
    images: images,
    queries: queries
};
