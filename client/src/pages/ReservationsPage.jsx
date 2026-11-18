import {Link} from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
import Reservations from '../components/Reservations.jsx';

export default function ReservationsPage(){
  const {user}=useAuth();
  return <main className="container-fluid p-4">
    <header className="section-heading"><h1 className="h3">Reservations</h1><Link className="btn btn-primary" to="/payment?purpose=reservation">Record Reservation Fee</Link></header>
    <Reservations admin={user?.role==='ADMIN'}/>
  </main>;
}
