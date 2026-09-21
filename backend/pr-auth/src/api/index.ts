import { serviceContracts } from '@my-sp-pr/contracts';

export * from '@my-sp-pr/contracts';
export const serviceContract = serviceContracts['pr-auth'];
export const apiContract = serviceContract.apiContract;
export const healthEndpoint = apiContract.getAuthHealth;
