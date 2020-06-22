const { plugin } = require('./index.js');
const fs = require('fs');
const globby = require('globby');

module.exports = function (eleventyConfig) {
    eleventyConfig.events.on('afterBuild', function() {
        console.log('afterBuild');
        fuck;
        fs.writeFileSync('test.txt', 'test');
    });

    // console.dir(eleventyConfig.events);

    eleventyConfig.addPlugin(plugin);

    eleventyConfig.setTemplateFormats([ "html", "liquid", "njk", "jpg" ]);
    eleventyConfig.addCollection('images', api => { 
        const glob = globby.sync('eleventy/images/**/*');
        console.log('GLOB');
        console.log(glob);
        return glob;
    });
    // eleventyConfig.addPassthroughCopy('eleventy/images');

    // console.log(eleventyConfig);

    return {
        dir: {
            input: './eleventy',
            output: './eleventy/_site'
        },
        htmlTemplateEngine: 'njk'
    }
}
