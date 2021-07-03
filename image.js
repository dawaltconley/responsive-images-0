const { parse:bgParse } = require('bg-size-parser');
const yaml = require('js-yaml');
const gm = require('gm');
const globby = require('globby');
const fs = require('fs');
const os = require('os');
const path = require('path');
const p = (...args) => path.join(__dirname, ...args);

const config = require(p('devices.js'));

const fileSuffix = (filePath, suf) => {
    const { dir, name, ext } = path.parse(filePath);
    return path.join(dir, name + suf + ext);
}

const imgSuffix = (src, w, h) => {
    let suffix = `-${w}x${h}`;
    if (h === undefined && w === undefined)
        throw new Error('imgSuffix missing both width and height arguments; needs at least one.');
    else if (!w && !h)
        return src;
    else if (w && !h)
        suffix = `-${w}w`;
    else if (h && !w)
        suffix = `-${h}h`;
    return fileSuffix(src, suffix);
}

const gmSize = file => new Promise((resolve, reject) =>
    gm(file).size((err, data) =>
        err ? reject(err) : resolve(data)));

const getOrientation = (w, h) => w >= h ? 'landscape' : 'portrait';

class BuildEnv {
    constructor(opts={}) {
        let {
            inputDir = '.',
            outputDir = path.join('.', '_site')
        } = opts;
        this.inputDir = inputDir;
        this.outputDir = outputDir;
    }
}

class Task extends Image {
    constructor(w, h, opts={}) {
        super(opts);
        this.size = { w, h };
        this.gravity = opts.gravity || 'Center';
        this.crop = opts.crop || false
        this.output = imgSuffix(this.outPath, w, h); // just pass src directly
        this.done = false;
    }

    async execute() {
        let { w, h } = this.size;
        try {
            await fs.promises.access(this.output);
        } catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
            await fs.promises.mkdir(path.dirname(this.output), { recursive: true }); // not necessary if the tags assume the image exists in _site already at right path location...maybe should use that for resizing, as inPath, rather than original file
            let operations = gm(this.inPath)
                .noProfile()
                .gravity(this.gravity)
                .resize(w, h, '^') // add option for no-upscale, '>' or '<'
            if (this.crop)
                operations = operations.crop(w, h); // ideally append something to path to indicate image was cropped...
            return new Promise((resolve, reject) => {
                // console.log('executing gm');
                operations.write(this.output, (e, d) => {
                    if (e) return reject(e);
                    this.done = true;
                    return resolve(d);
                });
            });
        }
        return null;
    }
}

class Image extends BuildEnv {
    constructor(src, opts={}) {
        super(opts); // can get rid of this if i'm always passing the context of Images
        this.src = src;
        this.inPath = path.join(this.inputDir, ...src.split('/')); // pointless? would need to split using path.separator
        this.outPath = path.join(this.outputDir, ...src.split('/'));
        this.measureTask = this.measure();
    }

    get orientation() {
        if (!this.width || !this.height)
            return undefined;
        return getOrientation(this.width, this.height);
    }

    getFilter(size) {
        let widthOnly = size.width && size.width.unit === '%' && size.height && size.height.size === 'auto';
        let heightOnly = size.height && size.height.unit === '%' && size.width && size.width.size === 'auto';
        if (size.keyword === 'contain' || size.width && size.width.size === 'auto' && size.height && size.height.size === 'auto') {
            return img => img.w <= this.width || img.h <= this.height;
        } else if (size.keyword === 'cover') {
            return img => img.w <= this.width && img.h <= this.height;
        } else if (widthOnly) { // something similar for vw / vh / vmin / vmax
            return img => this.width * size.width.size / 100 >= img.w;
        } else if (heightOnly) {
            return img => this.height * size.height.size / 100 >= img.h;
        }
        throw new Error(`Couldn't filter images based on the size given: ${size}`);
    }

    getImageSizes() {
        // no upscaling, only use image sizes smaller than the image itself
        // (these may be used differently depending on queries...perhaps only need queries)
        this.sizes = config.images.filter(img => img.w < this.width && img.height < this.height);
    }

    getQueries(size) {
        const filterFunc = this.getFilter(size);
        config.devices.forEach(d => {
            const resolutions = [];
            if (d.dppx.indexOf(1) < 0)
                d.dppx.push(1) // always include a dppx value of one for queries, to avoid upscaling when screen resizes on larger 1dppx displays
            for (const dppx of d) { // probably need to loop in reverse
                const w = d.w * dppx, h = d.h * dppx;
                const image = config.images.find((img, i, array) => { // config.images needs to be pre-sorted by width, if not resorting here
                    const next = array[i + 1];
                    return !next                                        // true if last
                        || w <= next.w && h <= img.h && h > next.h      // or last image high enough for current query, despite next image being wide enough
                        || w <= img.w && w > next.w;                    // or last image wide enough for current query
                });
                if (filterFunc(image))
                resolutions.push({
                    dppx: dppx,
                    ...image
                });
            }
        });
    }

    async measure() {
        let { width, height } = await gmSize(this.inPath);
        Object.assign(this, { width, height });
        return { width, height };
    }

    async figureShitOut(opts={}) {
        let {
            x = 'center',
            y = 'center',
            size = 'cover', // only need this (and x/y) when resizing both dimensions
            crop = false,
            width, height
        } = opts;
        if (this.width && !width || this.width < width)
            width = this.width;
        if (this.height && !height || this.height < height)
            height = this.height;
        size = bgParse(size)[0]; // only supports one bg image for now
    }
}
