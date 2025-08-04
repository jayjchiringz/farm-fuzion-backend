/* tslint:disable */
/* eslint-disable */
/**
 * Payment API Gateway
 * # Payment Gateway API Reference  This API is part of the our ecosystem. It allows you to make payments, find out the status of transactions and much more. Here you will find the latest documentation on setting up your solution.  ## Available Payment Providers  | Provider ID |   Provider Name         |  Country   |                 Notes                                                               | |-------------|-------------------------|------------|-------------------------------------------------------------------------------------| |     14      | Simulator               | ANY        | For testing purposes                                                                |  During tests runs, using 14 provider ID (simulator) the callback is not returned and the transaction remains in the \"in progress\" status and if successful you will see in the response  ```php {   \"order_id\": \"54321\",   \"transaction_id\": \"12345\",   \"transaction_ref\": \"\",   \"status\": 1,   \"result\": {       \"code\": 0,       \"message\": \"OK\"   },   \"provider_result\": {       \"code\": -8888,       \"message\": \"Good\"   },   \"service_id\": 1,   \"service_version\": \"1.03/1.14|1.0/1.26|1.0/1.0|1.01/1.01|1.01/1.01||1.01/1.27\",   \"service_date_time\": \"2023-05-15 10:00:00.000000\",   \"confirm_type\": 0 }  ```  ## Generating signature  Merchant’s request and callback have to be signed to verify sent data. To generate the signature all sent parameters from the payload are included in the order they were sent. The parameter signature should be excluded, of course, and added to the payload after generating.  *Note:* to generate a correct signature you need a secretKey received with other credentials.  ### PHP example  ```php function calculateSignature(array $data, string $secretKey, string $currentParamPrefix = \'\', int $depth = 16, int $currentRecursionLevel = 0 ): string {     if ($currentRecursionLevel >= $depth) {         throw new Exception(\'Recursion level exceeded\');     }      $stringForSignature = \'\';     foreach ($data as $key => $value) {         if (is_array($value)) {                 $stringForSignature .= calculateSignature(                 $value,                 $secretKey,                 \"$currentParamPrefix$key.\",                     $depth,                 $currentRecursionLevel + 1             );       } else if ($key !== \'signature\') {                 $stringForSignature .= \"$currentParamPrefix$key\" . $value;       }    }      if ($currentRecursionLevel == 0) {       return strtolower(hash_hmac(\'sha512\', $stringForSignature, $secretKey));     } else {       return $StringForSignature;     }  }  $postData = [   \'merchant_id\' => \'fffed61be9780b97c5e4c65e4e07bb6b\',   \'provider_id\' => 10,   \'client_id\' => \'080000000\',   \'country\' => \'KE\',   \'order_id\' => \'order_3444298767545\',   \'amount\' => 1000,   \'currency\' => \'CDF\',   \'callback_url\' => \'https://my.callback.url\' ];  $secretKey = \"cf11635572c1e8d77297207152dc0791ad91f22b32d23c758ce3ba2637202ad8f7290ba41f2243cccf32edde1dfb8bf0f5dea62525309e293b3adb2c76eed6a5\";  $signature = calculateSignature($postData, $secretKey);  $postData[\'signature\'] = $signature; ``` Examples in other languages are available on request    ## Status Codes ### The parameters below will be obtained by a status query    |  Code |     Name             |                 Description                                                                                                       |   |-------|----------------------|-----------------------------------------------------------------------------------------------------------------------------------|   |  -1   |  undefined           | Operation status is undefined (for example in an error situation)                                                                 |   |   0   |  initiated           | Operation is initiated                                                                                                            |   |   1   |  in progress         | Operation is in progress                                                                                                          |   |   2   |  success             | Operation is successful                                                                                                           |   |   3   |  failed              | Operation is failed                                                                                                               |    ## Operation Types Depending on the type of request you may see the following code ### You can see this parameter in the callback    |  Code  |   Operation     |   |--------|-----------------|   |  16    |  payment_b2c    |   |  17    |  payment_c2b    |   ## Available currencies  | Code | Name               | Locations                                                                                 | |------|--------------------|-------------------------------------------------------------------------------------------| | KES  | Kenyan shilling    | the Republic of Kenya                                                                     |    Responses for confirmation requests have the same format as original operation responses.  ## Callbacks   C2b transaction status is sent via callback because it needs a confirmation by client done asynchronously. Usually the   callback should be sent in 2-3 minutes maximum. In case of missing callback there is a way to get the transaction status   using API method *status*. It needs a transaction ID or order ID as an parameter and returns a status of the performed   transaction.  ###  Response for callback   Payment gateway considers the Merchant system response as successful if HTTP 200 was received.  # Payment Methods  ## Simulator   | Provider ID | Provider Name | Notes                     |   |-------------|---------------|---------------------------|   | 14          | Simulator     | For testing purposes      |    During tests runs, using 14 provider ID (simulator) the callback is not returned and the transaction remains in the \"in progress\" status and if successful you will see in the response   ```php   {     \"order_id\": \"54321\",     \"transaction_id\": \"12345\",     \"transaction_ref\": \"\",     \"status\": 1,     \"result\": {         \"code\": 0,         \"message\": \"OK\"     },     \"provider_result\": {         \"code\": -8888,         \"message\": \"Good\"     },     \"service_id\": 1,     \"service_version\": \"1.03/1.14|1.0/1.26|1.0/1.0|1.01/1.01|1.01/1.01||1.01/1.27\",     \"service_date_time\": \"2023-05-15 10:00:00.000000\",     \"confirm_type\": 0   }   ```    ## Kenya   | Provider ID  | Provider Name    |   |--------------|------------------|   | 43           | M-Pesa Safaricom |    254000000000 - This is the format of the phone number you have to send in the payment requests.    | c2b minimum | b2c minimum   | Maximum transaction limit|   |-------------|---------------|--------------------------|   | KES 1.00    | KES 500.00    |  KES 150000.00           | 
 *
 * The version of the OpenAPI document: v5.7.2
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */


import type { Configuration } from './configuration';
import type { AxiosPromise, AxiosInstance, RawAxiosRequestConfig } from 'axios';
import globalAxios from 'axios';
// Some imports not used depending on template conditions
// @ts-ignore
import { DUMMY_BASE_URL, assertParamExists, setApiKeyToObject, setBasicAuthToObject, setBearerAuthToObject, setOAuthToObject, setSearchParams, serializeDataIfNeeded, toPathString, createRequestFunction } from './common';
import type { RequestArgs } from './base';
// @ts-ignore
import { BASE_PATH, COLLECTION_FORMATS, BaseAPI, RequiredError, operationServerMap } from './base';

/**
 * 
 * @export
 * @interface CallbackBody
 */
export interface CallbackBody {
    /**
     * Payment provider transaction ID
     * @type {string}
     * @memberof CallbackBody
     */
    'transaction_id'?: string;
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof CallbackBody
     */
    'order_id'?: string;
    /**
     * Service ID
     * @type {string}
     * @memberof CallbackBody
     */
    'service_id'?: string;
    /**
     * Service version
     * @type {string}
     * @memberof CallbackBody
     */
    'service_version'?: string;
    /**
     * Date and time
     * @type {string}
     * @memberof CallbackBody
     */
    'service_date_time'?: string;
    /**
     * 
     * @type {CallbackBodyResult}
     * @memberof CallbackBody
     */
    'result'?: CallbackBodyResult;
    /**
     * Merchant’s request and callback have to be signed to verify sent data. To generate the signature all sent parameters are included in the order they were sent. The parameter signature should be excluded, of course. Example can be found <a href=\"#section/Payment-Gateway-API-Reference/Generating-signature\">here</a> 
     * @type {string}
     * @memberof CallbackBody
     */
    'signature'?: string;
}
/**
 * Result of the operation
 * @export
 * @interface CallbackBodyResult
 */
export interface CallbackBodyResult {
    /**
     * 
     * @type {ResultCodeDef}
     * @memberof CallbackBodyResult
     */
    'code'?: ResultCodeDef;
    /**
     * Result message of the operation
     * @type {string}
     * @memberof CallbackBodyResult
     */
    'message'?: string;
}


/**
 * 
 * @export
 * @interface PaymentBody
 */
export interface PaymentBody {
    /**
     * Unique Merchant ID received during the merchant registration
     * @type {string}
     * @memberof PaymentBody
     */
    'merchant_id': string;
    /**
     * Customer ID (usually mobile phone number of the customer)
     * @type {string}
     * @memberof PaymentBody
     */
    'customer_id': string;
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof PaymentBody
     */
    'order_id': string;
    /**
     * Amount to pay, should be in format with two digits after point
     * @type {string}
     * @memberof PaymentBody
     */
    'amount': string;
    /**
     * Currency code in ISO 4217 format from the <a href=\"#section/Payment-Gateway-API-Reference/Available-currencies\">list</a> of availabe currencies
     * @type {string}
     * @memberof PaymentBody
     */
    'currency': string;
    /**
     * Country code in ISO 3166-1 alpha-2 format as defined in the payment providers <a href=\"#section/Payment-Gateway-API-Reference/Available-Payment-Providers\"></a>
     * @type {string}
     * @memberof PaymentBody
     */
    'country'?: string;
    /**
     * URL to notify the merchant via callback. Recommended
     * @type {string}
     * @memberof PaymentBody
     */
    'callback_url'?: string;
    /**
     * 
     * @type {ProviderDef}
     * @memberof PaymentBody
     */
    'provider_id': ProviderDef;
    /**
     * Merchant’s request and callback have to be signed to verify sent data. To generate the signature all sent parameters are included in the order they were sent. The parameter signature should be excluded, of course. Example can be found <a href=\"#section/Payment-Gateway-API-Reference/Generating-signature\">here</a> 
     * @type {string}
     * @memberof PaymentBody
     */
    'signature': string;
}


/**
 * 
 * @export
 * @interface PaymentBodyB2c
 */
export interface PaymentBodyB2c {
    /**
     * Unique Merchant ID received during the merchant registration
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'merchant_id': string;
    /**
     * Customer ID (usually mobile phone number of the customer)
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'customer_id': string;
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'order_id': string;
    /**
     * Amount to pay, with two digits after point
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'amount': string;
    /**
     * Currency code in ISO 4217 format from the <a href=\"#section/Payment-Gateway-API-Reference/Available-currencies\">list</a> of availabe currencies
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'currency': string;
    /**
     * Country code in ISO 3166-1 alpha-2 format as defined in the payment providers <a href=\"#section/Payment-Gateway-API-Reference/Available-Payment-Providers\"></a>
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'country'?: string;
    /**
     * URL to notify the merchant via callback
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'callback_url'?: string;
    /**
     * 
     * @type {ProviderDef}
     * @memberof PaymentBodyB2c
     */
    'provider_id': ProviderDef;
    /**
     * Merchant’s request and callback have to be signed to verify sent data. To generate the signature all sent parameters are included in the order they were sent. The parameter signature should be excluded, of course. Example can be found <a href=\"#section/Payment-Gateway-API-Reference/Generating-signature\">here</a> 
     * @type {string}
     * @memberof PaymentBodyB2c
     */
    'signature': string;
}


/**
 * 
 * @export
 * @interface PaymentBodyDeposit
 */
export interface PaymentBodyDeposit {
    /**
     * Unique Merchant ID received during the merchant registration
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'merchant_id': string;
    /**
     * Customer ID (usually mobile phone number of the customer)
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'customer_id': string;
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'order_id': string;
    /**
     * Amount to pay, with two digits after point
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'amount': string;
    /**
     * Currency code in ISO 4217 format from the <a href=\"#section/Payment-Gateway-API-Reference/Available-currencies\">list</a> of availabe currencies
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'currency': string;
    /**
     * Country code in ISO 3166-1 alpha-2 format as defined in the payment providers <a href=\"#section/Payment-Gateway-API-Reference/Available-Payment-Providers\"></a>
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'country'?: string;
    /**
     * Extra parameters specific payment method
     * @type {object}
     * @memberof PaymentBodyDeposit
     */
    'extra'?: object;
    /**
     * 
     * @type {PaymentBodyDepositCard}
     * @memberof PaymentBodyDeposit
     */
    'card'?: PaymentBodyDepositCard;
    /**
     * ID of the payment provider. Can be 15 only
     * @type {number}
     * @memberof PaymentBodyDeposit
     */
    'provider_id'?: number;
    /**
     * Transaction destination ID
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'destination_id'?: string;
    /**
     * Merchant’s request and callback have to be signed to verify sent data. To generate the signature all sent parameters are included in the order they were sent. The parameter signature should be excluded, of course. Example can be found <a href=\"#section/Payment-Gateway-API-Reference/Generating-signature\">here</a> 
     * @type {string}
     * @memberof PaymentBodyDeposit
     */
    'signature': string;
}
/**
 * Extra parameters specific payment method, only for card providers like
 * @export
 * @interface PaymentBodyDepositCard
 */
export interface PaymentBodyDepositCard {
    /**
     * Pan
     * @type {string}
     * @memberof PaymentBodyDepositCard
     */
    'pan'?: string;
    /**
     * Card expiration year
     * @type {string}
     * @memberof PaymentBodyDepositCard
     */
    'exp_year'?: string;
    /**
     * Card expiration month
     * @type {string}
     * @memberof PaymentBodyDepositCard
     */
    'exp_month'?: string;
    /**
     * CVC/CVV code
     * @type {string}
     * @memberof PaymentBodyDepositCard
     */
    'cvc'?: string;
}
/**
 * 
 * @export
 * @interface PaymentBodyWithdrawal
 */
export interface PaymentBodyWithdrawal {
    /**
     * Unique Merchant ID received during the merchant registration
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'merchant_id': string;
    /**
     * Customer ID (usually mobile phone number of the customer)
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'customer_id': string;
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'order_id': string;
    /**
     * Amount to pay, with two digits after point
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'amount': string;
    /**
     * Currency code in ISO 4217 format from the <a href=\"#section/Payment-Gateway-API-Reference/Available-currencies\">list</a> of availabe currencies
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'currency': string;
    /**
     * Country code in ISO 3166-1 alpha-2 format as defined in the payment providers <a href=\"#section/Payment-Gateway-API-Reference/Available-Payment-Providers\"></a>
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'country'?: string;
    /**
     * Transaction confirmation code
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'confirmation_code'?: string;
    /**
     * Extra parameters specific payment method
     * @type {object}
     * @memberof PaymentBodyWithdrawal
     */
    'extra'?: object;
    /**
     * ID of the payment provider. Can be 15 only
     * @type {number}
     * @memberof PaymentBodyWithdrawal
     */
    'provider_id'?: number;
    /**
     * Transaction destination ID
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'destination_id'?: string;
    /**
     * Merchant’s request and callback have to be signed to verify sent data. To generate the signature all sent parameters are included in the order they were sent. The parameter signature should be excluded, of course. Example can be found <a href=\"#section/Payment-Gateway-API-Reference/Generating-signature\">here</a> 
     * @type {string}
     * @memberof PaymentBodyWithdrawal
     */
    'signature': string;
}
/**
 * Provider ID. Can be one of the option from <a href=\"#section/Payment-Gateway-API-Reference/Available-Payment-Providers\">this list</a>. 
 * @export
 * @enum {number}
 */

export const ProviderDef = {
    NUMBER_14: 14,
    NUMBER_40: 40
} as const;

export type ProviderDef = typeof ProviderDef[keyof typeof ProviderDef];


/**
 * 
 * @export
 * @interface ResponseBody
 */
export interface ResponseBody {
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof ResponseBody
     */
    'order_id': string;
    /**
     * The value is generated by the Provider for each Operation. May be empty
     * @type {string}
     * @memberof ResponseBody
     */
    'transaction_id': string;
    /**
     * The value is generated by the Provider for each successful Operation. May be empty
     * @type {string}
     * @memberof ResponseBody
     */
    'transaction_ref': string;
    /**
     * Status of the payment. Status descriptions can be found <a href=\"#section/Payment-Gateway-API-Reference/Status-Codes\">here</a>. 
     * @type {number}
     * @memberof ResponseBody
     */
    'status': ResponseBodyStatusEnum;
    /**
     * 
     * @type {ResponseBodyResult}
     * @memberof ResponseBody
     */
    'result': ResponseBodyResult;
    /**
     * 
     * @type {ResponseBodyProviderResult}
     * @memberof ResponseBody
     */
    'provider_result': ResponseBodyProviderResult;
    /**
     * Unique ID of the service in the Payment gateway
     * @type {string}
     * @memberof ResponseBody
     */
    'service_id': string;
    /**
     * Payment gateway service version used for operation
     * @type {string}
     * @memberof ResponseBody
     */
    'service_version': string;
    /**
     * Payment gateway timestamp of the operation
     * @type {string}
     * @memberof ResponseBody
     */
    'service_date_time': string;
}

export const ResponseBodyStatusEnum = {
    NUMBER_MINUS_1: -1,
    NUMBER_0: 0,
    NUMBER_1: 1,
    NUMBER_2: 2,
    NUMBER_3: 3,
    NUMBER_4: 4,
    NUMBER_5: 5,
    NUMBER_6: 6,
    NUMBER_7: 7
} as const;

export type ResponseBodyStatusEnum = typeof ResponseBodyStatusEnum[keyof typeof ResponseBodyStatusEnum];

/**
 * 
 * @export
 * @interface ResponseBodyB2c
 */
export interface ResponseBodyB2c {
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof ResponseBodyB2c
     */
    'order_id': string;
    /**
     * The value is generated by the Provider for each Operation. May be empty
     * @type {string}
     * @memberof ResponseBodyB2c
     */
    'transaction_id': string;
    /**
     * The value is generated by the Provider for each successful Operation. May be empty
     * @type {string}
     * @memberof ResponseBodyB2c
     */
    'transaction_ref': string;
    /**
     * Status of the payment. Status descriptions can be found <a href=\"#section/Payment-Gateway-API-Reference/Status-Codes\">here</a>. 
     * @type {number}
     * @memberof ResponseBodyB2c
     */
    'status': ResponseBodyB2cStatusEnum;
    /**
     * 
     * @type {ResponseBodyResult}
     * @memberof ResponseBodyB2c
     */
    'result': ResponseBodyResult;
    /**
     * 
     * @type {ResponseBodyProviderResult}
     * @memberof ResponseBodyB2c
     */
    'provider_result': ResponseBodyProviderResult;
    /**
     * Unique ID of the service in the Payment gateway
     * @type {string}
     * @memberof ResponseBodyB2c
     */
    'service_id': string;
    /**
     * Payment gateway service version used for operation
     * @type {string}
     * @memberof ResponseBodyB2c
     */
    'service_version': string;
    /**
     * Payment gateway timestamp of the operation
     * @type {string}
     * @memberof ResponseBodyB2c
     */
    'service_date_time': string;
    /**
     * 
     * @type {string}
     * @memberof ResponseBodyB2c
     */
    'confirm_type': string;
}

export const ResponseBodyB2cStatusEnum = {
    NUMBER_MINUS_1: -1,
    NUMBER_0: 0,
    NUMBER_1: 1,
    NUMBER_2: 2,
    NUMBER_3: 3,
    NUMBER_4: 4,
    NUMBER_5: 5,
    NUMBER_6: 6,
    NUMBER_7: 7
} as const;

export type ResponseBodyB2cStatusEnum = typeof ResponseBodyB2cStatusEnum[keyof typeof ResponseBodyB2cStatusEnum];

/**
 * 
 * @export
 * @interface ResponseBodyError
 */
export interface ResponseBodyError {
    /**
     * 
     * @type {ResponseBodyErrorResult}
     * @memberof ResponseBodyError
     */
    'result'?: ResponseBodyErrorResult;
}
/**
 * Result of the operation
 * @export
 * @interface ResponseBodyErrorResult
 */
export interface ResponseBodyErrorResult {
    /**
     * Result code of the operation
     * @type {string}
     * @memberof ResponseBodyErrorResult
     */
    'code'?: ResponseBodyErrorResultCodeEnum;
    /**
     * Result message of the operation
     * @type {string}
     * @memberof ResponseBodyErrorResult
     */
    'message'?: string;
}

export const ResponseBodyErrorResultCodeEnum = {
    _1: '1',
    _2: '2',
    _3: '3',
    _4: '4'
} as const;

export type ResponseBodyErrorResultCodeEnum = typeof ResponseBodyErrorResultCodeEnum[keyof typeof ResponseBodyErrorResultCodeEnum];

/**
 * Result of the payment from provider. Should be used as additional information. Final payment state you should get from \"status\" parameter 
 * @export
 * @interface ResponseBodyProviderResult
 */
export interface ResponseBodyProviderResult {
    /**
     * 
     * @type {ResultCodeDef}
     * @memberof ResponseBodyProviderResult
     */
    'code'?: ResultCodeDef;
    /**
     * 
     * @type {string}
     * @memberof ResponseBodyProviderResult
     */
    'message'?: string;
}


/**
 * Result of the request to Payment Gateway 
 * @export
 * @interface ResponseBodyResult
 */
export interface ResponseBodyResult {
    /**
     * 
     * @type {ResultCodeDef}
     * @memberof ResponseBodyResult
     */
    'code'?: ResultCodeDef;
    /**
     * 
     * @type {string}
     * @memberof ResponseBodyResult
     */
    'message'?: string;
}


/**
 * Result code of the operation - 0 - OK - Operation is successful - 1 - INVALID PIN - PIN wasn’t accepted by Provider - 2 - PIN IS BLANK - PIN wasn’t accepted by Provider - 3 - INVALID PIN LENGTH - PIN wasn’t accepted by Provider. - 10201 - MERCHANT AUTHENTICATION ERROR - The merchant’s request wasn’t authenticated by the   Payment gateway security mechanism. For example, because of an incorrect signature. 
 * @export
 * @enum {string}
 */

export const ResultCodeDef = {
    _0: '0',
    _1: '1',
    _2: '2',
    _3: '3',
    _10201: '10201'
} as const;

export type ResultCodeDef = typeof ResultCodeDef[keyof typeof ResultCodeDef];


/**
 * 
 * @export
 * @interface StatusBody
 */
export interface StatusBody {
    /**
     * Unique Merchant ID received during the merchant registration
     * @type {string}
     * @memberof StatusBody
     */
    'merchant_id': string;
    /**
     * The unique value is generated by the transaction initiator for each Operation. Max length is 128 symbols. Allowed symbols: [a-z], [A-Z], [0-9], “_” (underscore character), “-” (hyphen), “:” (colon), “.” (dot). For example, GUID or TIMESTAMP can be used as an order_id. This parameter provides API idempotency. It means that requests with identical nonce from the same transaction initiator will have identical responses and The corresponding operation won’t be repeated. 
     * @type {string}
     * @memberof StatusBody
     */
    'order_id': string;
    /**
     * Merchant’s request and callback have to be signed to verify sent data. To generate the signature all sent parameters are included in the order they were sent. The parameter signature should be excluded, of course. Example can be found <a href=\"#section/Payment-Gateway-API-Reference/Generating-signature\">here</a> 
     * @type {string}
     * @memberof StatusBody
     */
    'signature': string;
}

/**
 * OnlinePaymentsApi - axios parameter creator
 * @export
 */
export const OnlinePaymentsApiAxiosParamCreator = function (configuration?: Configuration) {
    return {
        /**
         * Cashless payment from the merchant to the customer. If the confirm_type response parameter is a non-zero merchant, send the second payment_b2c request with confirmation data according to the section Confirmation Types. 
         * @summary Cashless payment from the merchant to the customer.
         * @param {string} publicId Merchant public ID
         * @param {PaymentBodyB2c} paymentBodyB2c Parameters to initiate the merchant to the customer payment
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        publicIdPaymentB2cPost: async (publicId: string, paymentBodyB2c: PaymentBodyB2c, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            // verify required parameter 'publicId' is not null or undefined
            assertParamExists('publicIdPaymentB2cPost', 'publicId', publicId)
            // verify required parameter 'paymentBodyB2c' is not null or undefined
            assertParamExists('publicIdPaymentB2cPost', 'paymentBodyB2c', paymentBodyB2c)
            const localVarPath = `/{public_id}/payment_b2c`
                .replace(`{${"public_id"}}`, encodeURIComponent(String(publicId)));
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;


    
            localVarHeaderParameter['Content-Type'] = 'application/json';

            setSearchParams(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};
            localVarRequestOptions.data = serializeDataIfNeeded(paymentBodyB2c, localVarRequestOptions, configuration)

            return {
                url: toPathString(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
        /**
         * 
         * @summary Cashless payment from the customer to the merchant
         * @param {string} publicId Merchant public ID
         * @param {PaymentBody} paymentBody Parameters to initiate a customer to the merchant payment
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        publicIdPaymentC2bPost: async (publicId: string, paymentBody: PaymentBody, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            // verify required parameter 'publicId' is not null or undefined
            assertParamExists('publicIdPaymentC2bPost', 'publicId', publicId)
            // verify required parameter 'paymentBody' is not null or undefined
            assertParamExists('publicIdPaymentC2bPost', 'paymentBody', paymentBody)
            const localVarPath = `/{public_id}/payment_c2b`
                .replace(`{${"public_id"}}`, encodeURIComponent(String(publicId)));
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;


    
            localVarHeaderParameter['Content-Type'] = 'application/json';

            setSearchParams(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};
            localVarRequestOptions.data = serializeDataIfNeeded(paymentBody, localVarRequestOptions, configuration)

            return {
                url: toPathString(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
        /**
         * 
         * @summary Request a status of the transaction performed earlier
         * @param {string} publicId Merchant public ID
         * @param {StatusBody} statusBody Get the status of the performed transaction
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        publicIdStatusPost: async (publicId: string, statusBody: StatusBody, options: RawAxiosRequestConfig = {}): Promise<RequestArgs> => {
            // verify required parameter 'publicId' is not null or undefined
            assertParamExists('publicIdStatusPost', 'publicId', publicId)
            // verify required parameter 'statusBody' is not null or undefined
            assertParamExists('publicIdStatusPost', 'statusBody', statusBody)
            const localVarPath = `/{public_id}/status`
                .replace(`{${"public_id"}}`, encodeURIComponent(String(publicId)));
            // use dummy base URL string because the URL constructor only accepts absolute URLs.
            const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }

            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options};
            const localVarHeaderParameter = {} as any;
            const localVarQueryParameter = {} as any;


    
            localVarHeaderParameter['Content-Type'] = 'application/json';

            setSearchParams(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = {...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers};
            localVarRequestOptions.data = serializeDataIfNeeded(statusBody, localVarRequestOptions, configuration)

            return {
                url: toPathString(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
    }
};

/**
 * OnlinePaymentsApi - functional programming interface
 * @export
 */
export const OnlinePaymentsApiFp = function(configuration?: Configuration) {
    const localVarAxiosParamCreator = OnlinePaymentsApiAxiosParamCreator(configuration)
    return {
        /**
         * Cashless payment from the merchant to the customer. If the confirm_type response parameter is a non-zero merchant, send the second payment_b2c request with confirmation data according to the section Confirmation Types. 
         * @summary Cashless payment from the merchant to the customer.
         * @param {string} publicId Merchant public ID
         * @param {PaymentBodyB2c} paymentBodyB2c Parameters to initiate the merchant to the customer payment
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async publicIdPaymentB2cPost(publicId: string, paymentBodyB2c: PaymentBodyB2c, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ResponseBodyB2c>> {
            const localVarAxiosArgs = await localVarAxiosParamCreator.publicIdPaymentB2cPost(publicId, paymentBodyB2c, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = operationServerMap['OnlinePaymentsApi.publicIdPaymentB2cPost']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
        /**
         * 
         * @summary Cashless payment from the customer to the merchant
         * @param {string} publicId Merchant public ID
         * @param {PaymentBody} paymentBody Parameters to initiate a customer to the merchant payment
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async publicIdPaymentC2bPost(publicId: string, paymentBody: PaymentBody, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ResponseBody>> {
            const localVarAxiosArgs = await localVarAxiosParamCreator.publicIdPaymentC2bPost(publicId, paymentBody, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = operationServerMap['OnlinePaymentsApi.publicIdPaymentC2bPost']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
        /**
         * 
         * @summary Request a status of the transaction performed earlier
         * @param {string} publicId Merchant public ID
         * @param {StatusBody} statusBody Get the status of the performed transaction
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        async publicIdStatusPost(publicId: string, statusBody: StatusBody, options?: RawAxiosRequestConfig): Promise<(axios?: AxiosInstance, basePath?: string) => AxiosPromise<ResponseBody>> {
            const localVarAxiosArgs = await localVarAxiosParamCreator.publicIdStatusPost(publicId, statusBody, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = operationServerMap['OnlinePaymentsApi.publicIdStatusPost']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => createRequestFunction(localVarAxiosArgs, globalAxios, BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
    }
};

/**
 * OnlinePaymentsApi - factory interface
 * @export
 */
export const OnlinePaymentsApiFactory = function (configuration?: Configuration, basePath?: string, axios?: AxiosInstance) {
    const localVarFp = OnlinePaymentsApiFp(configuration)
    return {
        /**
         * Cashless payment from the merchant to the customer. If the confirm_type response parameter is a non-zero merchant, send the second payment_b2c request with confirmation data according to the section Confirmation Types. 
         * @summary Cashless payment from the merchant to the customer.
         * @param {string} publicId Merchant public ID
         * @param {PaymentBodyB2c} paymentBodyB2c Parameters to initiate the merchant to the customer payment
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        publicIdPaymentB2cPost(publicId: string, paymentBodyB2c: PaymentBodyB2c, options?: RawAxiosRequestConfig): AxiosPromise<ResponseBodyB2c> {
            return localVarFp.publicIdPaymentB2cPost(publicId, paymentBodyB2c, options).then((request) => request(axios, basePath));
        },
        /**
         * 
         * @summary Cashless payment from the customer to the merchant
         * @param {string} publicId Merchant public ID
         * @param {PaymentBody} paymentBody Parameters to initiate a customer to the merchant payment
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        publicIdPaymentC2bPost(publicId: string, paymentBody: PaymentBody, options?: RawAxiosRequestConfig): AxiosPromise<ResponseBody> {
            return localVarFp.publicIdPaymentC2bPost(publicId, paymentBody, options).then((request) => request(axios, basePath));
        },
        /**
         * 
         * @summary Request a status of the transaction performed earlier
         * @param {string} publicId Merchant public ID
         * @param {StatusBody} statusBody Get the status of the performed transaction
         * @param {*} [options] Override http request option.
         * @throws {RequiredError}
         */
        publicIdStatusPost(publicId: string, statusBody: StatusBody, options?: RawAxiosRequestConfig): AxiosPromise<ResponseBody> {
            return localVarFp.publicIdStatusPost(publicId, statusBody, options).then((request) => request(axios, basePath));
        },
    };
};

/**
 * OnlinePaymentsApi - object-oriented interface
 * @export
 * @class OnlinePaymentsApi
 * @extends {BaseAPI}
 */
export class OnlinePaymentsApi extends BaseAPI {
    public_idPaymentC2bPost(publicId: string, body: Omit<PaymentBody, "signature" | "merchant_id">): { data: any; } | PromiseLike<{ data: any; }> {
        throw new Error("Method not implemented.");
    }
    public_idPaymentB2cPost(publicId: string, body: Omit<PaymentBodyB2c, "signature" | "merchant_id">): { data: any; } | PromiseLike<{ data: any; }> {
        throw new Error("Method not implemented.");
    }
    public_idStatusPost(publicId: string, body: Omit<StatusBody, "signature" | "merchant_id">): { data: any; } | PromiseLike<{ data: any; }> {
        throw new Error("Method not implemented.");
    }
    /**
     * Cashless payment from the merchant to the customer. If the confirm_type response parameter is a non-zero merchant, send the second payment_b2c request with confirmation data according to the section Confirmation Types. 
     * @summary Cashless payment from the merchant to the customer.
     * @param {string} publicId Merchant public ID
     * @param {PaymentBodyB2c} paymentBodyB2c Parameters to initiate the merchant to the customer payment
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof OnlinePaymentsApi
     */
    public publicIdPaymentB2cPost(publicId: string, paymentBodyB2c: PaymentBodyB2c, options?: RawAxiosRequestConfig) {
        return OnlinePaymentsApiFp(this.configuration).publicIdPaymentB2cPost(publicId, paymentBodyB2c, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 
     * @summary Cashless payment from the customer to the merchant
     * @param {string} publicId Merchant public ID
     * @param {PaymentBody} paymentBody Parameters to initiate a customer to the merchant payment
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof OnlinePaymentsApi
     */
    public publicIdPaymentC2bPost(publicId: string, paymentBody: PaymentBody, options?: RawAxiosRequestConfig) {
        return OnlinePaymentsApiFp(this.configuration).publicIdPaymentC2bPost(publicId, paymentBody, options).then((request) => request(this.axios, this.basePath));
    }

    /**
     * 
     * @summary Request a status of the transaction performed earlier
     * @param {string} publicId Merchant public ID
     * @param {StatusBody} statusBody Get the status of the performed transaction
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     * @memberof OnlinePaymentsApi
     */
    public publicIdStatusPost(publicId: string, statusBody: StatusBody, options?: RawAxiosRequestConfig) {
        return OnlinePaymentsApiFp(this.configuration).publicIdStatusPost(publicId, statusBody, options).then((request) => request(this.axios, this.basePath));
    }
}



