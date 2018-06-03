/*
    This script will attempt to scrape the USDA database and persist it into a MongoDB database.
 */
const Crawler = require('crawler');
const csvtojson = require('csvtojson');

const BASE_URL = 'https://ndb.nal.usda.gov';
const START_URL = 'https://ndb.nal.usda.gov/ndb/search/list?maxsteps=6&format=&count=&max=25&sort=fd_s&fgcd=&manu=&lfacet=&qlookup=&ds=&qt=&qp=&qa=&qn=&q=&ing=&offset=0&order=asc';

/*
    Regex Patterns for Extraction
 */
const ID_PATTERN = new RegExp(/^(\d)+/g);
const DESCRIPTION_PATTERN = new RegExp(/(?!(\d+))(.*?)(?=, UPC)/g);
const UPC_PATTERN = new RegExp(/(?!UPC )\d+$/g);
const NUTRIENT_PATTERN = new RegExp(/Nutrient,Unit[^]+Other/g);
const NUTRIENT_SUBTRACTION_PATTERN = new RegExp(/Proximates\n|Minerals\n|Vitamins\n|Lipids\n|Amino Acids\n|Other\n|Ingredients/g);
const INGREDIENTS_PATTERN = new RegExp(/Ingredients\n"[^]+"/g);
const INGREDIENTS_SUBTRACTION_PATTERN = new RegExp(/Ingredients\n"|\."/g);
const INGREDIENTS_CLEANUP_PATTERN = new RegExp(/[()\[\]]/g);
const INGREDIENTS_COMMA_SPLIT_PATTERN = new RegExp(/,\s?/g);

let db;

/**
 * Initiate the food crawl
 * @returns {Promise<none>}
 * @param mongodb
 */
exports.crawlFood = function(mongodb){
    return new Promise((resolve)=>{
        db = mongodb;
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
            let nutrientCsv;
            let nutrientJson;
            let ingredients;

            try{
                nutrientCsv = getNutrientCsv(res.body);
                if(nutrientCsv){
                    nutrientJson = await csvtojson().fromString(nutrientCsv);
                    nutrientJson = removeUnnecessaryFieldsFromNutrientJson(nutrientJson);
                    ingredients = getIngredientsArray(res.body);

                    if(nutrientJson){
                        console.log(`Found ingredients and nutrients for ${res.options.foodObj.description}`);
                        let foodObj = res.options.foodObj;
                        foodObj.ingredients = ingredients;
                        foodObj.nutrients = nutrientJson;

                        try{
                            await db.insert(foodObj);
                        } catch (e){
                            console.error(`Could not insert the food item to the database.`);
                        }

                    } else {
                        console.error(`COULD NOT FIND nutrients for ${res.options.foodObj.description}`);
                        console.log(`Here is the URI: ${res.options.uri}`);
                    }

                }
            } catch (e){
                console.error(e);
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
    $('td:nth-child(2) a').each((i, result)=>{
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
            console.log(`Found: ${description}`)
        } catch (e){}

    });

    return resultsArray;
}

/**
 * Isolated the nutrient information from the entire food item's CSV.
 * @param csvString Contains the full CSV data from the food item.
 * @returns {String} CSV containing nutrient information.
 */
function getNutrientCsv(csvString){
    let nutrientCsv;
    let nutrientMatch = csvString.match(NUTRIENT_PATTERN);
    if(nutrientMatch){
        nutrientCsv = nutrientMatch[0];
        nutrientCsv = nutrientCsv.replace(NUTRIENT_SUBTRACTION_PATTERN, "").trim();
    } else{
        console.error(csvString);
    }
    return nutrientCsv;
}

/**
 * Parses the ingredients from the CSV data for the food item.
 * @param csvString
 * @returns {Array} An array containing the ingredients for the food item.
 */
function getIngredientsArray(csvString){
    let ingredients;
    const ingredientsMatch = csvString.match(INGREDIENTS_PATTERN);
    if(ingredientsMatch){
        ingredients = ingredientsMatch[0].replace(INGREDIENTS_SUBTRACTION_PATTERN, "").trim();
        ingredients = ingredients.replace(INGREDIENTS_CLEANUP_PATTERN, ""); // remove parentheses and brackets
        return ingredients.split(INGREDIENTS_COMMA_SPLIT_PATTERN);
    } else {
        return null;
    }
}

/**
 * Removes the 'Data points', 'Std', and another unnecessary field from the nutrient json.
 * @param nutrientJson
 * @returns {Object} Clean nutrient object.
 */
function removeUnnecessaryFieldsFromNutrientJson(nutrientJson) {
    let cleanNutrientJson = nutrientJson;

    for(let i = 0; i < cleanNutrientJson.length; i++){
        if(cleanNutrientJson[i].hasOwnProperty('Data points')){
            delete cleanNutrientJson[i]['Data points'];
        }
        if(cleanNutrientJson[i].hasOwnProperty('Std')){
            delete cleanNutrientJson[i]['Std'];
        }
    }

    return cleanNutrientJson;
}