import React, { useState, useEffect } from 'react';
import api from '../services/api';

const VehicleList = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const response = await api.get('/vehicles/');
        setVehicles(response.data);
      } catch (err) {
        setError('Failed to fetch vehicles. You may not have permission.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, []);

  if (loading) {
    return <p>Loading vehicles...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>{error}</p>;
  }

  return (
    <div>
      <h3>Vehicle Fleet</h3>
      {vehicles.length === 0 ? (
        <p>No vehicles found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Class</th>
              <th>License Plate</th>
              <th>Capacity</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>{vehicle.id}</td>
                <td>{vehicle.service_class}</td>
                <td>{vehicle.license_plate}</td>
                <td>{vehicle.capacity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default VehicleList;
