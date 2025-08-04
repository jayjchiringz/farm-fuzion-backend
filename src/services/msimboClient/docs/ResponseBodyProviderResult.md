# ResponseBodyProviderResult

Result of the payment from provider. Should be used as additional information. Final payment state you should get from \"status\" parameter 

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**code** | [**ResultCodeDef**](ResultCodeDef.md) |  | [optional] [default to undefined]
**message** | **string** |  | [optional] [default to undefined]

## Example

```typescript
import { ResponseBodyProviderResult } from './api';

const instance: ResponseBodyProviderResult = {
    code,
    message,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
