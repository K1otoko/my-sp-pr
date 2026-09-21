import { serviceContracts } from '@my-sp-pr/contracts';

export * from '@my-sp-pr/contracts';
export const serviceContract = serviceContracts['pr-admin'];
export const apiContract = serviceContract.apiContract;
export const healthEndpoint = apiContract.getAdminHealth;
