const mongoose  = require('mongoose') ;
const { schema } = require('./Product');


const CampaignSchemma = new mongoose.Schema({

    campaignName:{
         type : String
    } ,
 
    campaginDescription :{
        type:String ,
    }


}) 

