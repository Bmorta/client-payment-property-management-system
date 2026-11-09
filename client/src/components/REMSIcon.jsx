export default function REMSIcon({size=40,className='',decorative=false}){
 const pixels=size>128?512:size>64?192:64;
 return <img className={`rems-icon ${className}`} src={`/branding/rems-${pixels}.png`} width={size} height={size} alt={decorative?'':'REMS — Real Estate Management System'} draggable={false}/>;
}
