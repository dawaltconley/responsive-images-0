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
        w: 1680,        // 1440 < w <= 1680
        h: 1050,        // 1024 < h <= 1050 OR is this 900 < h <= 1050 (allow overlap on height, since w never overlaps)
        dppx: [ 1 ],    //
        flip: false },  // screen size 1500x980
    {                   //
        w: 1440,        // 1366 < w <= 1440
        h: 900,         //  800 < h <=  900
        dppx: [ 2, 1 ], //
        flip: false },  //
    {
        w: 1366,        // should look *backwards* to form the following query 
        h: 1024,        // 1280 < w <= 1366
        dppx: [ 2, 1 ], //  900 < h <= 1024
        flip: true },   //
    {
        w: 1280,                // 1024 < w <= 1280
        h: 800,                 //  768 < h <=  800
        dppx: [ 2, 1.5, 1 ],    //
        flip: true },           //
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
    // {
    //     w: 2000,                // 1920 < w <= 2000
    //     h: 500 },               //  432 < h <=  500
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

const images = [
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
    const resolutions = [];
    if (d.dppx.indexOf(1) < 0)
        d.dppx.push(1); // always include a dppx value of one for queries, to avoid upscaling when screen resizes on larger 1dppx displays
    d.dppx.forEach(dppx => {
        const w = d.w * dppx, h = d.h * dppx;
        const image = images.sort((a, b) => b.w - a.w).find((img, i, array) => {
            const next = array[i + 1];
            return !next                                        // true if last
                || w <= next.w && h <= img.h && h > next.h      // or last image high enough for current query, despite next image being wide enough
                || w <= img.w && w > next.w;                    // or last image wide enough for current query
        });
        console.log(image);
        if (w > image.w)
            console.log(`warning: image width too small for query ${d.w}x${d.h}x${dppx}`);
        if (h > image.h)
            console.log(`warning: image height too small for query ${d.w}x${d.h}x${dppx}`);
        resolutions.push({
            dppx: dppx,
            ...image
        });
    });
    queries.landscape.push({
        w: d.w,
        h: d.h,
        images: resolutions
    });
    if (d.flip) {
        queries.portrait.push({
            w: d.h,
            h: d.w,
            images: resolutions.map(r => {
                let flipped = { w: r.h, h: r.w };
                if(!images.sort((a, b) => b.h - a.h).find(i => i.w === flipped.w && i.h === flipped.h))
                    images.push(flipped); // this is key...reassigning to images before returning
                return {
                    ...r,
                    ...flipped
                }
            })
        });
        // resolutions.forEach(r => {
        //     if(!images.find(i => i.w === r.h && i.h === r.w))
        //         images.push({ w: r.h, h: r.w });
        // })
        // could push the flipped sizes to images here
    }
});

module.exports = {
    devices: devices,
    images: images,
    queries: queries
};
