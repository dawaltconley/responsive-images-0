const { plugin } = require('./index.js');

module.exports = eleventyConfig => {
    eleventyConfig.addPlugin(plugin); 

    return {
        dir: {
            input: './eleventy',
            output: './eleventy/_site'
        },
        htmlTemplateEngine: 'njk'
    }
}
