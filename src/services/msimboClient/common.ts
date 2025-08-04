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


import type { Configuration } from "./configuration";
import type { RequestArgs } from "./base";
import type { AxiosInstance, AxiosResponse } from 'axios';
import { RequiredError } from "./base";

/**
 *
 * @export
 */
export const DUMMY_BASE_URL = 'https://example.com'

/**
 *
 * @throws {RequiredError}
 * @export
 */
export const assertParamExists = function (functionName: string, paramName: string, paramValue: unknown) {
    if (paramValue === null || paramValue === undefined) {
        throw new RequiredError(paramName, `Required parameter ${paramName} was null or undefined when calling ${functionName}.`);
    }
}

/**
 *
 * @export
 */
export const setApiKeyToObject = async function (object: any, keyParamName: string, configuration?: Configuration) {
    if (configuration && configuration.apiKey) {
        const localVarApiKeyValue = typeof configuration.apiKey === 'function'
            ? await configuration.apiKey(keyParamName)
            : await configuration.apiKey;
        object[keyParamName] = localVarApiKeyValue;
    }
}

/**
 *
 * @export
 */
export const setBasicAuthToObject = function (object: any, configuration?: Configuration) {
    if (configuration && (configuration.username || configuration.password)) {
        object["auth"] = { username: configuration.username, password: configuration.password };
    }
}

/**
 *
 * @export
 */
export const setBearerAuthToObject = async function (object: any, configuration?: Configuration) {
    if (configuration && configuration.accessToken) {
        const accessToken = typeof configuration.accessToken === 'function'
            ? await configuration.accessToken()
            : await configuration.accessToken;
        object["Authorization"] = "Bearer " + accessToken;
    }
}

/**
 *
 * @export
 */
export const setOAuthToObject = async function (object: any, name: string, scopes: string[], configuration?: Configuration) {
    if (configuration && configuration.accessToken) {
        const localVarAccessTokenValue = typeof configuration.accessToken === 'function'
            ? await configuration.accessToken(name, scopes)
            : await configuration.accessToken;
        object["Authorization"] = "Bearer " + localVarAccessTokenValue;
    }
}

function setFlattenedQueryParams(urlSearchParams: URLSearchParams, parameter: any, key: string = ""): void {
    if (parameter == null) return;
    if (typeof parameter === "object") {
        if (Array.isArray(parameter)) {
            (parameter as any[]).forEach(item => setFlattenedQueryParams(urlSearchParams, item, key));
        }
        else {
            Object.keys(parameter).forEach(currentKey =>
                setFlattenedQueryParams(urlSearchParams, parameter[currentKey], `${key}${key !== '' ? '.' : ''}${currentKey}`)
            );
        }
    }
    else {
        if (urlSearchParams.has(key)) {
            urlSearchParams.append(key, parameter);
        }
        else {
            urlSearchParams.set(key, parameter);
        }
    }
}

/**
 *
 * @export
 */
export const setSearchParams = function (url: URL, ...objects: any[]) {
    const searchParams = new URLSearchParams(url.search);
    setFlattenedQueryParams(searchParams, objects);
    url.search = searchParams.toString();
}

/**
 *
 * @export
 */
export const serializeDataIfNeeded = function (value: any, requestOptions: any, configuration?: Configuration) {
    const nonString = typeof value !== 'string';
    const needsSerialization = nonString && configuration && configuration.isJsonMime
        ? configuration.isJsonMime(requestOptions.headers['Content-Type'])
        : nonString;
    return needsSerialization
        ? JSON.stringify(value !== undefined ? value : {})
        : (value || "");
}

/**
 *
 * @export
 */
export const toPathString = function (url: URL) {
    return url.pathname + url.search + url.hash
}

/**
 *
 * @export
 */
export const createRequestFunction = function (axiosArgs: RequestArgs, globalAxios: AxiosInstance, BASE_PATH: string, configuration?: Configuration) {
    return <T = unknown, R = AxiosResponse<T>>(axios: AxiosInstance = globalAxios, basePath: string = BASE_PATH) => {
        const axiosRequestArgs = {...axiosArgs.options, url: (axios.defaults.baseURL ? '' : configuration?.basePath ?? basePath) + axiosArgs.url};
        return axios.request<T, R>(axiosRequestArgs);
    };
}
