import {useAdminReviews} from '../context/AdminReviewContext.jsx';
import {lazy,Suspense} from 'react';
const AdminReviewDialog=lazy(()=>import('./AdminReviewDialog.jsx'));
export default function QuickAdminReview(){const review=useAdminReviews();if(!review?.quick)return null;return <Suspense fallback={<p role="status">Opening administrator review…</p>}><AdminReviewDialog row={review.quick} onClose={()=>review.setQuick(null)} onSaved={()=>{review.setQuick(null);review.refresh()}}/></Suspense>}
