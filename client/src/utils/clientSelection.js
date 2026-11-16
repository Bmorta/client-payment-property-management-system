// ClientLookup callers historically expect .item; SearchInput returns the raw record.
export function clientChoice(value){const item=value?.item||value;return item?{...(value?.item?value:{}),...item,item}:null}
