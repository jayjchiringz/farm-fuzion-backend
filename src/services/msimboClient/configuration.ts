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


export interface ConfigurationParameters {
    apiKey?: string | Promise<string> | ((name: string) => string) | ((name: string) => Promise<string>);
    username?: string;
    password?: string;
    accessToken?: string | Promise<string> | ((name?: string, scopes?: string[]) => string) | ((name?: string, scopes?: string[]) => Promise<string>);
    basePath?: string;
    serverIndex?: number;
    baseOptions?: any;
    formDataCtor?: new () => any;
}

export class Configuration {
    /**
     * parameter for apiKey security
     * @param name security name
     * @memberof Configuration
     */
    apiKey?: string | Promise<string> | ((name: string) => string) | ((name: string) => Promise<string>);
    /**
     * parameter for basic security
     *
     * @type {string}
     * @memberof Configuration
     */
    username?: string;
    /**
     * parameter for basic security
     *
     * @type {string}
     * @memberof Configuration
     */
    password?: string;
    /**
     * parameter for oauth2 security
     * @param name security name
     * @param scopes oauth2 scope
     * @memberof Configuration
     */
    accessToken?: string | Promise<string> | ((name?: string, scopes?: string[]) => string) | ((name?: string, scopes?: string[]) => Promise<string>);
    /**
     * override base path
     *
     * @type {string}
     * @memberof Configuration
     */
    basePath?: string;
    /**
     * override server index
     *
     * @type {number}
     * @memberof Configuration
     */
    serverIndex?: number;
    /**
     * base options for axios calls
     *
     * @type {any}
     * @memberof Configuration
     */
    baseOptions?: any;
    /**
     * The FormData constructor that will be used to create multipart form data
     * requests. You can inject this here so that execution environments that
     * do not support the FormData class can still run the generated client.
     *
     * @type {new () => FormData}
     */
    formDataCtor?: new () => any;

    constructor(param: ConfigurationParameters = {}) {
        this.apiKey = param.apiKey;
        this.username = param.username;
        this.password = param.password;
        this.accessToken = param.accessToken;
        this.basePath = param.basePath;
        this.serverIndex = param.serverIndex;
        this.baseOptions = {
            ...param.baseOptions,
            headers: {
                ...param.baseOptions?.headers,
            },
        };
        this.formDataCtor = param.formDataCtor;
    }

    /**
     * Check if the given MIME is a JSON MIME.
     * JSON MIME examples:
     *   application/json
     *   application/json; charset=UTF8
     *   APPLICATION/JSON
     *   application/vnd.company+json
     * @param mime - MIME (Multipurpose Internet Mail Extensions)
     * @return True if the given MIME is JSON, false otherwise.
     */
    public isJsonMime(mime: string): boolean {
        const jsonMime: RegExp = new RegExp('^(application\/json|[^;/ \t]+\/[^;/ \t]+[+]json)[ \t]*(;.*)?$', 'i');
        return mime !== null && (jsonMime.test(mime) || mime.toLowerCase() === 'application/json-patch+json');
    }
}
