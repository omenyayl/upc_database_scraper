const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path');
const foodScraper = require('./crawl_food_data');

const CONFIG_FILE = path.resolve(__dirname, 'config.json');

(async function() {

    const configJson = readConfig();

    const mongoUrl = configJson['mongoUrl'];
    let client, db;
    try{
        client = await MongoClient.connect(mongoUrl);
        db = client.db(configJson.dbName).collection(configJson.collectionName);
    } catch (err){
        console.error(err);
    }

    try{
        await foodScraper.crawlFood(db);
    } catch (e){
        console.error(e);
    }

    client.close();

})();

function readConfig() {
    if(!fs.existsSync(CONFIG_FILE)){
        console.error('The config file is not found. Create a JSON file named config.json in the same directory as this ' +
            'script. Then, create a field inside the JSON named mongoUrl, and populate it with your mongodb server\'s ' +
            'URL.');
        process.exit(1);
    }

    const configJson = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

    if(!configJson.hasOwnProperty('mongoUrl') ||
        !configJson.hasOwnProperty('collectionName') ||
        ! configJson.hasOwnProperty('dbName')){
        console.error('The config file is not setup correctly. Here is an example config file: \n' + JSON.stringify(
            {
                mongoUrl: 'mongodb://my.mongo.url',
                collectionName: 'myCollectionName',
                dbName: "myDbName"
            }
            , null, 4));
        process.exit(1);
    }

    return configJson;
}