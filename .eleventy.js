const Images = require('./index.js');

const { plugin } = new Images({
    inputDir: './eleventy',
    outputDir: './eleventy/_site'
});

module.exports = eleventyConfig => {
   // eleventyConfig.addPassthroughCopy('eleventy/images');
    eleventyConfig.addPlugin(plugin); 

    return {
        dir: {
            input: './eleventy',
            output: './eleventy/_site'
        },
        htmlTemplateEngine: 'njk'
    }
}
