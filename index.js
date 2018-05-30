/*
    This script will attempt to scrape the USDA database and persist it into a MongoDB database.
 */

const request = require('request-promise');
const cheerio = require('cheerio');
const Crawler = require('crawler');
const tabletojson = require('tabletojson');


const BASE_URL = 'https://ndb.nal.usda.gov';
const START_URL = 'https://ndb.nal.usda.gov/ndb/search/list?maxsteps=6&format=&count=&max=25&sort=fd_s&fgcd=&manu=&lfacet=&qlookup=&ds=&qt=&qp=&qa=&qn=&q=&ing=&offset=25&order=asc';

/*
    Regex Patterns for Extraction
 */
const ID_PATTERN = new RegExp(/^(\d)+/g);
const DESCRIPTION_PATTERN = new RegExp(/(?!(\d+))(.*?)(?=, UPC)/g);
const UPC_PATTERN = new RegExp(/(?!UPC )\d+$/g);

function main(){
    usdaResultsCrawler.on('drain', ()=>{
       console.log('Done!');
    });
    usdaResultsCrawler.queue(START_URL);
}

/**
 * Main crawler object that calls onRequestUsdaResults function whenever it requests a search page
 * filled with results.
 * @type {Crawler}
 */
let usdaResultsCrawler = new Crawler({
    maxConnections : 1,
    // This will be called for each crawled page
    callback : onRequestUsdaResults
});

function onRequestUsdaResults(err, res, done){
    if(err){
        console.error(err);
    } else {
        let $ = res.$;

        let resultsArray = getUsdaResults($);
        console.log(resultsArray);

        let nextButton = $('.nextLink').get(0);
        let nextPage = BASE_URL + $(nextButton).attr('href');

        // usdaResultsCrawler.queue(nextPage);
    }

    done();
}

function getUsdaResults($){
    let resultsArray = [];
    $('td:nth-child(2) a').each(async (i, result)=>{
        let result_text = $(result).text().trim();

        let resultObj;

        try{
            let id = result_text.match(ID_PATTERN).pop();
            let url = `https://ndb.nal.usda.gov/ndb/foods/show/${id}?format=Full&reportfmt=csv&Qv=1`;
            let description = result_text.match(DESCRIPTION_PATTERN)[0].trim();
            let upc = result_text.match(UPC_PATTERN).pop();
            resultObj = {
                id, description, upc, url
            };
            resultsArray.push(resultObj);
        } catch (e){}

        if(resultObj){
            let resultCsv;
            try{
                resultCsv = await request(resultObj.url);
                console.log(resultCsv);
            } catch (e) {
                console.error(e);
            }
        }

    });

    return resultsArray;
}

main();