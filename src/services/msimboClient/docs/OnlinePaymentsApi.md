# OnlinePaymentsApi

All URIs are relative to *https://api.msimbo.tech*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**publicIdPaymentB2cPost**](#publicidpaymentb2cpost) | **POST** /{public_id}/payment_b2c | Cashless payment from the merchant to the customer.|
|[**publicIdPaymentC2bPost**](#publicidpaymentc2bpost) | **POST** /{public_id}/payment_c2b | Cashless payment from the customer to the merchant|
|[**publicIdStatusPost**](#publicidstatuspost) | **POST** /{public_id}/status | Request a status of the transaction performed earlier|

# **publicIdPaymentB2cPost**
> ResponseBodyB2c publicIdPaymentB2cPost(paymentBodyB2c)

Cashless payment from the merchant to the customer. If the confirm_type response parameter is a non-zero merchant, send the second payment_b2c request with confirmation data according to the section Confirmation Types. 

### Example

```typescript
import {
    OnlinePaymentsApi,
    Configuration,
    PaymentBodyB2c
} from './api';

const configuration = new Configuration();
const apiInstance = new OnlinePaymentsApi(configuration);

let publicId: string; //Merchant public ID (default to undefined)
let paymentBodyB2c: PaymentBodyB2c; //Parameters to initiate the merchant to the customer payment

const { status, data } = await apiInstance.publicIdPaymentB2cPost(
    publicId,
    paymentBodyB2c
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **paymentBodyB2c** | **PaymentBodyB2c**| Parameters to initiate the merchant to the customer payment | |
| **publicId** | [**string**] | Merchant public ID | defaults to undefined|


### Return type

**ResponseBodyB2c**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | B2C Payment Success Response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **publicIdPaymentC2bPost**
> ResponseBody publicIdPaymentC2bPost(paymentBody)


### Example

```typescript
import {
    OnlinePaymentsApi,
    Configuration,
    PaymentBody
} from './api';

const configuration = new Configuration();
const apiInstance = new OnlinePaymentsApi(configuration);

let publicId: string; //Merchant public ID (default to undefined)
let paymentBody: PaymentBody; //Parameters to initiate a customer to the merchant payment

const { status, data } = await apiInstance.publicIdPaymentC2bPost(
    publicId,
    paymentBody
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **paymentBody** | **PaymentBody**| Parameters to initiate a customer to the merchant payment | |
| **publicId** | [**string**] | Merchant public ID | defaults to undefined|


### Return type

**ResponseBody**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Payment success response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **publicIdStatusPost**
> ResponseBody publicIdStatusPost(statusBody)


### Example

```typescript
import {
    OnlinePaymentsApi,
    Configuration,
    StatusBody
} from './api';

const configuration = new Configuration();
const apiInstance = new OnlinePaymentsApi(configuration);

let publicId: string; //Merchant public ID (default to undefined)
let statusBody: StatusBody; //Get the status of the performed transaction

const { status, data } = await apiInstance.publicIdStatusPost(
    publicId,
    statusBody
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **statusBody** | **StatusBody**| Get the status of the performed transaction | |
| **publicId** | [**string**] | Merchant public ID | defaults to undefined|


### Return type

**ResponseBody**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Transaction status success response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

