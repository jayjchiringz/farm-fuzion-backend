# PaymentBodyDepositCard

Extra parameters specific payment method, only for card providers like

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**pan** | **string** | Pan | [optional] [default to undefined]
**exp_year** | **string** | Card expiration year | [optional] [default to undefined]
**exp_month** | **string** | Card expiration month | [optional] [default to undefined]
**cvc** | **string** | CVC/CVV code | [optional] [default to undefined]

## Example

```typescript
import { PaymentBodyDepositCard } from './api';

const instance: PaymentBodyDepositCard = {
    pan,
    exp_year,
    exp_month,
    cvc,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
