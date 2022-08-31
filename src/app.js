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

async function getEconomic() {
    
    const appToken = 'Si7VAOfmXW2hkHhe6GSscgMGrrxNga5adYkQf2NGqRA1';
    
    let economic = axios.create({
            baseURL: 'https://api.billysbilling.com/v2/',
    		headers: { 'X-AppSecretToken': appToken, 'X-AgreementGrantToken': process.env.EconomicAccessToken, 'Content-Type': 'application/json' }
    	});
    	
	economic.interceptors.response.use(function (response) {
			console.log("SUCCESS " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			console.log(JSON.stringify(error));
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
			}
	    	return Promise.reject(error);
		});
		
    return economic;
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

async function postMessage(ims, detail, text) {
    let message = new Object();
	message.time = Date.now();
	message.source = "Billy Integration";
	message.messageType = "INFO";
	message.messageText = text;
	message.deviceName = detail.deviceName;
	message.userId = detail.userId;
	await ims.post("events/" + detail.eventId + "/messages", message);
}

async function postMessages(ims, detail, transaction, lines) {
	postMessage(ims, detail, "Booked with voucher no. " + transaction.voucherNo);
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        postMessage(ims, detail, line.accountNo);
    }
}

class ChartOfAccounts {
    
    constructor(accounts) {
        this.accounts = accounts;
    }
    
    lookup(accountNo) {
        let i = 0;
        let found = false;
        while (i < this.accounts.length && !found) {
            let account = this.accounts[i];
            if (account.accountNo == accountNo) {
                found = true;
            } else {
                i++;
            }
        } 
        if (found) {
            return this.accounts[i];
        }
        return null;
    }
}

class CurrencyTable {
    
    constructor(currencies) {
        this.currencies = currencies;
    }
    
    lookup(name) {
        let i = 0;
        let found = false;
        while (i < this.currencies.length && !found) {
            let currency = this.currencies[i];
            if (currency.name == name) {
                found = true;
            } else {
                i++;
            }
        } 
        if (found) {
            return this.currencies[i];
        }
        return null;
    }
}


exports.documentHandler = async (event, awsContext) => {

    console.log(JSON.stringify(event));

    let detail = event.detail;
    
    let ims = await getIMS();
    
    let billy = await getEconomic();
    let organization = await billy.get('organization');
    
    let response = await billy.get('accounts');
    let accounts = response.data.accounts;
    let chartOfAccounts = new ChartOfAccounts(accounts);
    
    response = await billy.get('currencies');
    let currencies = response.data.currencies;
    let currencyTable = new CurrencyTable(currencies);
    
    response = await ims.get('documents/' + detail.documentId);
    let document = response.data;
    
    response = await ims.get("contexts/" + process.env.ContextId);
    let context = response.data;
    let dataDocument = JSON.parse(context.dataDocument);
    let setup = dataDocument.BillyIntegration;
    
    let transaction = new Object();
    transaction.organizationId = organization.id;
    transaction.entryDate = document.localizedPostingDate;

    let transactionLines = [];

    if (detail.documentType == 'GOODS_RECEIPT') {
        
        transaction.description = "Modtagelseskvittering " + document.documentNumber;

        response = await ims.get('inboundShipments/' + detail.inboundShipmentId, { params: { piggyBack: true }});
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
        
        transaction.voucherNo = "J-" + document.documentNumber; 
        transaction.description = "Justeringsliste " + document.documentNumber;
        
        let transactionLine = new Object();
        transactionLine.accountId = chartOfAccounts.lookup(setup.InventoryAdjustmentAccount).id;
        transactionLine.amount = Math.abs(document.value);
        transactionLine.side = document.value < 0 ? 'debit' : 'credit';
        transactionLine.currencyId = context.baseCurrencyCode;
        transactionLines.push(transactionLine);
        
        transactionLine = new Object();
        transactionLine.accountId = chartOfAccounts.lookup(setup.InventoryAccount).id;
        transactionLine.amount = Math.abs(document.value);
        transactionLine.side = document.value < 0 ? 'credit' : 'debit';
        transactionLine.currencyId = context.baseCurrencyCode;
        transactionLines.push(transactionLine);
        
    } else if (detail.documentType == 'COST_OF_SALES_LIST') {
        
        transaction.description = "Vareforbrugsliste " + document.documentNumber;

        
    } else if (detail.documentType == 'COST_VARIANCE_LIST') {
        
        transaction.description = "Kostpris-efterberegning " + document.documentNumber;

        // document value on inventory account and cost of procurement account
        
    }
    
    transaction.lines = transactionLines;
    response = await billy.post('daybookTransactions', { daybookTransaction: transaction });
    transaction = response.data.daybookTransactions[0];
    transactionLines = response.data.daybookTransactionLines;
    
    await postMessage(ims, detail, transaction.voucherNo);

};
