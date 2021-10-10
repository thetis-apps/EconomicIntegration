# Introduction

This application integrates Thetis IMS with the accounting system Billy.  

# Installation

You may install the application from the Serverless Application Repository. It is registered under the name thetis-ims-billy-integration.

## Parameters

When installing the application you must provide values for the following parameters:

- ContextId
- ThetisClientId
- ThetisClientSecret
- ApiKey
- BillyApiToken
- DevOpsEmail

A short explanation for each of these parameters are provided upon installation.

# Configuration

In the data document of the context:
```
  "BillyIntegration": {
    "InventoryAccount": 5830,
    "CostOfSalesAccount": 2,
    "GoodsNotReceivedAccount": 5825,
    "CostOfProcurementAccount": 1,
    "InventoryAdjustmentAccount": 1260
  }

```

# Events

## Document created

When a relevant document is created within Thetis IMS the application creates corresponding transactions within Billy. 

The corresponding transactions depend on the type of the document.

### Adjustment list

The value of the document is posted against the inventory adjustment account and the inventory account.

### Goods receipt

The goods not received account is credited the purchase price.

The value of the document is posted against the inventory account. The value of the document is given by the standard cost price of the items receiced.

The balance is posted against the cost of procurement account.

### Cost of sales list

The value of the document is posted against the inventory account and the cost of sales account.

### Cost variance list

The value of the document is posted against the inventory account and the cost of procurement account.

