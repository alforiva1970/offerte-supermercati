import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import VehicleList from '../components/VehicleList';
import CreateVehicleForm from '../components/CreateVehicleForm';
import ServiceRequestList from '../components/ServiceRequestList';
import ServiceRequestForm from '../components/ServiceRequestForm';
import AssignedTransfersList from '../components/AssignedTransfersList'; // Import operator's list

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const [vehicleListKey, setVehicleListKey] = useState(0);
  const [requestListKey, setRequestListKey] = useState(0);

  const handleVehicleCreated = () => {
    setVehicleListKey(prevKey => prevKey + 1);
  };

  const handleServiceRequestCreated = () => {
    setRequestListKey(prevKey => prevKey + 1);
  };

  const renderRoleSpecificDashboard = () => {
    if (!user) return <p>Loading...</p>;

    switch (user.role) {
      case 'Amministratore':
        return (
          <div>
            <h2>Admin Dashboard</h2>
            <p>You have full access to the system.</p>
            <CreateVehicleForm onVehicleCreated={handleVehicleCreated} />
            <VehicleList key={vehicleListKey} />
          </div>
        );
      case 'Cliente':
        return (
          <div>
            <h2>Client Dashboard</h2>
            <p>Here you can manage your transfers and requests.</p>
            <ServiceRequestForm onServiceRequestCreated={handleServiceRequestCreated} />
            <ServiceRequestList key={requestListKey} />
          </div>
        );
      case 'Operatore':
        return (
          <div>
            <h2>Operator Dashboard</h2>
            <p>Here you can view and manage your assigned services.</p>
            <AssignedTransfersList />
          </div>
        );
      case 'Utilizzatore':
        return (
          <div>
            <h2>User Dashboard</h2>
            <p>Here you can request new services.</p>
            <ServiceRequestForm onServiceRequestCreated={handleServiceRequestCreated} />
            <ServiceRequestList key={requestListKey} />
          </div>
        );
      default:
        return <p>Welcome! Your role is not defined.</p>;
    }
  };

  return (
    <div>
      <h1>Transfer Management System</h1>
      <p>Welcome, {user?.username} ({user?.role})</p>
      <button onClick={logout}>Logout</button>
      <hr />
      {renderRoleSpecificDashboard()}
    </div>
  );
};

export default DashboardPage;
