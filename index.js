const foodScraper = require('./crawl_food_data');
const fs = require('fs');

const outDir = './output';

(async function() {
    try{
        initDir(outDir);
        await foodScraper.crawlFood(outDir);
    } catch (e){
        console.error(e);
    }
})();

/**
 * Creates a directory at the given path
 * @param path The directory path
 */
function initDir(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
}
