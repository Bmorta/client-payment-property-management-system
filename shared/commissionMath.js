export const roundRatio=(a,b,c)=>Number((BigInt(a)*BigInt(b)+BigInt(Math.floor(c/2)))/BigInt(c));
export const percentAmount=(cents,bps)=>roundRatio(cents,bps,10000);
export function apportionBudgets(cents,agents){
 const entries=agents.map(a=>({agent:String(a.agent),floor:Number(BigInt(cents)*BigInt(a.percentageBps)/10000n),remainder:BigInt(cents)*BigInt(a.percentageBps)%10000n}));
 let extra=percentAmount(cents,agents.reduce((n,a)=>n+a.percentageBps,0))-entries.reduce((n,e)=>n+e.floor,0);
 entries.sort((a,b)=>a.remainder===b.remainder?a.agent.localeCompare(b.agent):a.remainder>b.remainder?-1:1);
 for(const entry of entries)if(extra>0){entry.floor++;extra--}
 return new Map(entries.map(e=>[e.agent,e.floor]));
}
export function splitCommission(total,term){let regular=Math.round(total/term);if(regular*(term-1)>total)regular=Math.floor(total/term);return Array.from({length:term},(_,i)=>i===term-1?total-regular*(term-1):regular)}

export function previewCommission(contract,agents,termMonths){
 if(![contract.totalCents,contract.downPaymentCents].every(Number.isSafeInteger)||contract.totalCents<contract.downPaymentCents||contract.downPaymentCents<0||!Number.isSafeInteger(termMonths)||termMonths<1||termMonths>1200)throw new Error('Choose valid contract values and a commission term.');
 if(!agents.length||agents.some(a=>!Number.isSafeInteger(a.percentageBps)||a.percentageBps<=0||a.percentageBps>10000))throw new Error('Enter valid agent percentages.');
 const total=apportionBudgets(contract.totalCents,agents),dp=apportionBudgets(contract.downPaymentCents,agents);
 return agents.map(a=>{const totalCents=total.get(String(a.agent)),downPaymentCents=Math.min(totalCents,dp.get(String(a.agent))),remainingCents=totalCents-downPaymentCents,periods=splitCommission(remainingCents,termMonths);return {agent:String(a.agent),totalCents,downPaymentCents,remainingCents,monthlyCents:periods[0],finalCents:periods.at(-1),periods}});
}
export function percentageBps(value){const text=String(value);if(!/^\d+(\.\d{1,2})?$/.test(text))throw new Error('Use a percentage with up to two decimal places.');const [whole,fraction='']=text.split('.');const bps=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(bps)||bps<0||bps>10000)throw new Error('Percentage must be between 0 and 100.');return bps}

export const suggestedCommissionTerm=months=>Number.isSafeInteger(Number(months))&&Number(months)>0?(Number(months)<=12?Number(months):Number(months)>=48?30:24):null;
