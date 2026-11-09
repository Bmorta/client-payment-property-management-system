export const CLOSED_CONTRACTS=Object.freeze(['TRANSFERRED','CANCELLED','FORFEITED','SUPERSEDED']);
export const isClosedContract=account=>CLOSED_CONTRACTS.includes(account?.lifecycle);
