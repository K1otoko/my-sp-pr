import { serviceContracts } from '@my-sp-pr/contracts';

export * from '@my-sp-pr/contracts';
export const serviceContract = serviceContracts['pr-chat'];
export const apiContract = serviceContract.apiContract;
export const healthEndpoint = apiContract.getChatHealth;
export const readinessEndpoint = apiContract.getChatReadiness;
