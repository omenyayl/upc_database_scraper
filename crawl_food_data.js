/*
    This script will attempt to scrape the USDA database and persist it into a MongoDB database.
 */
const Crawler = require('crawler');
const process = require('process');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://ndb.nal.usda.gov';
const START_URL = 'https://ndb.nal.usda.gov/ndb/search/list?maxsteps=6&format=&count=&max=25&sort=fd_s&fgcd=&manu=&lfacet=&qlookup=&ds=&qt=&qp=&qa=&qn=&q=&ing=&offset=0&order=asc';

let outputDirectory;

/**
 * Initiate the food crawl
 * @returns {Promise<>}
 * @param outDir The output directory
 */
exports.crawlFood = function(outDir){
   outputDirectory = outDir;
    return new Promise((resolve)=>{
        nutritionCsvCrawler.on('drain', ()=>{
            resolve();
        });
        usdaResultsCrawler.queue(START_URL);
    });
};

/**
 * Main crawler object that calls onRequestUsdaResults function whenever it requests a search page
 * filled with results.
 * @type {Crawler}
 */
const usdaResultsCrawler = new Crawler({
    maxConnections : 5,
    // This will be called for each crawled search page
    callback : (err, res, done) => {
        if(err){
            console.error(err);
        } else {
            let $ = res.$;

            let resultsArray = getUsdaResults($);

            resultsArray.forEach((result)=>{
                nutritionCsvCrawler.queue({
                    uri: result.url,
                    foodObj: result
                });
            });

            let nextButton = $('.nextLink').get(0); // Search page pagination
            let nextPage = BASE_URL + $(nextButton).attr('href');

            if(nextButton) usdaResultsCrawler.queue(nextPage);
        }
        done();
    }
});


/**
 * Crawler that requests and parses the CSV containing nutrient and ingredient information about a specific food item.
 * @type {Crawler}
 */
const nutritionCsvCrawler = new Crawler({
    maxConnections: 1,
    rateLimit: 1020, // Avoids clogging their server
    jQuery: false,
    callback: async (err, res, done) => {
        if(err){
            console.error(err);
        } else {
            let csv = res.body;
            let id = res.options.foodObj.id;
            let description = res.options.foodObj.description;
            if (csv) {
                let outPath = path.join(outputDirectory, id + '.csv');
                fs.writeFile(outPath, csv, err => {
                    if (!err) {
                        console.log(`Data for ${description} written to ${outPath}`);
                    }
                    else {
                        console.error(err);
                    }
                });
            }

            done();
        }
    }
});

/**
 * Parses the search page for search items, as well as applying a regex on each item's title to get the item's
 * url, description, and upc
 * @param $ Loaded cheerio
 * @returns {Array} An array of search item objects, with each object having an id, description, upc, and url.
 */
function getUsdaResults($){
    let resultsArray = [];
    $('tbody tr').each((i, result)=>{

        let id = $('td:nth-child(2)', result).text().trim();
        
        if (id) {
            let url = `https://ndb.nal.usda.gov/ndb/foods/show/${id}?format=Full&reportfmt=csv&Qv=1`;
            let descriptionUPC = $('td:nth-child(3)', result)
                .text()
                .trim()
                .split(/,?\s*UPC:\s*/g);
            let description = descriptionUPC[0];
            let upc = descriptionUPC[1];
            
            resultsArray.push({
                id, description, upc, url
            });
        }

    });

    return resultsArray;
}

