// Request contact snapshots may fill missing master data without modifying Client.
export function requestContact(client,input={}){
 const phone=String(input.phone||client?.contactNumber||'').trim(),email=String(input.email||client?.email||'').trim();
 const name=client?[client.firstName,client.middleName,client.lastName,client.suffix].filter(Boolean).join(' '):String(input.name||'').trim();
 const errors={};if(!name||name.length>160)errors.name='Enter the client or prospective buyer name (up to 160 characters).';
 if(!phone)errors.phone='Enter a Contact Number before continuing.';else if(phone.length>80)errors.phone='Contact Number must not exceed 80 characters.';
 if(email.length>160||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.email='Enter a valid email address or leave it blank.';
 return {contact:{name,phone,email},errors};
}
