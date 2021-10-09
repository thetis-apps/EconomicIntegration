/**
 * Copyright 2021 Thetis Apps Aps
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * 
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * 
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const axios = require('axios');

var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'});

async function getBilly() {
    
    let billy = axios.create({
            baseURL: 'https://api.billysbilling.com/v2',
    		headers: { 'X-Access-Token': process.env.BillyApiToken, 'Content-Type': 'application/json' }
    	});
    	
	billy.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			console.log(JSON.stringify(error));
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
			}
	    	return Promise.reject(error);
		});
		
    return billy;
}

async function getIMS() {
	
    const authUrl = "https://auth.thetis-ims.com/oauth2/";
    const apiUrl = "https://api.thetis-ims.com/2/";

	var clientId = process.env.ClientId;   
	var clientSecret = process.env.ClientSecret; 
	var apiKey = process.env.ApiKey;  
	
    let data = clientId + ":" + clientSecret;
	let base64data = Buffer.from(data, 'UTF-8').toString('base64');	
	
	var imsAuth = axios.create({
			baseURL: authUrl,
			headers: { Authorization: "Basic " + base64data, 'Content-Type': "application/x-www-form-urlencoded" },
			responseType: 'json'
		});
    
    var response = await imsAuth.post("token", 'grant_type=client_credentials');
    var token = response.data.token_type + " " + response.data.access_token;
    
    var ims = axios.create({
    		baseURL: apiUrl,
    		headers: { "Authorization": token, "x-api-key": apiKey, "Content-Type": "application/json" }
    	});

	ims.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			console.log(JSON.stringify(error));
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
			}
	    	return Promise.reject(error);
		});

	return ims;
}

exports.documentHandler = async (event, context) => {

    let detail = event.detail;
    
    let ims = await getIMS();
    
    let billy = await getBilly();
    
    let response = ims.get('documents/' + detail.documentId);
    let document = response.data;
    
    if (detail.documentType == 'GOODS_RECEIPT') {
        
        response = ims.get('inboundShipments/' + detail.inboundShipmentId, { params: { piggyBack: true }});
        let inboundShipment = response.data;
        
        let total = 0;
        let lines = inboundShipment.inboundShipmentLines;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            total = total + line.expectedAmount;
        }
        
        total = total - inboundShipment.combinedDiscount;
        
        let totalInBase = total * inboundShipment.currencyExchangeRate;
        
        // total on goods not received in currency?
        
        let costOfProcurement = document.value - totalInBase;
        
        // document.value on inventory account
        
        // cost of procurement on its own account

    } else if (detail.documentType == 'ADJUSTMENT_LIST') {
        
    } else if (detail.documentType == 'COST_OF_SALES_LIST') {
        
    } else if (detail.documentType == 'COST_VARIANCE_LIST') {
        
        // document value on inventory account and cost of procurement account
        
    }
};
