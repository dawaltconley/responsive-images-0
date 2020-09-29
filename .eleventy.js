const Images = require('./index.js');

const { plugin } = new Images({
    inputDir: './eleventy',
    outputDir: './eleventy/_site'
});

module.exports = eleventyConfig => {
    eleventyConfig.addPlugin(plugin); 
    eleventyConfig.addPassthroughCopy('eleventy/images');

    return {
        dir: {
            input: './eleventy',
            output: './eleventy/_site'
        },
        htmlTemplateEngine: 'njk'
    }
}
