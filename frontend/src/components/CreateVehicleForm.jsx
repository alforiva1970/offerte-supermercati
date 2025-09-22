import React, { useState } from 'react';
import api from '../services/api';

const CreateVehicleForm = ({ onVehicleCreated }) => {
  const [serviceClass, setServiceClass] = useState('Auto');
  const [licensePlate, setLicensePlate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!licensePlate || !capacity) {
      setError('All fields are required.');
      return;
    }

    try {
      const vehicleData = {
        service_class: serviceClass,
        license_plate: licensePlate,
        capacity: parseInt(capacity, 10),
      };
      await api.post('/vehicles/', vehicleData);

      // Clear form
      setLicensePlate('');
      setCapacity('');
      setSuccess('Vehicle created successfully!');

      // Notify parent component to refresh the list
      if (onVehicleCreated) {
        onVehicleCreated();
      }

    } catch (err) {
      setError('Failed to create vehicle. License plate might already exist.');
      console.error(err);
    }
  };

  return (
    <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
      <h4>Add a New Vehicle</h4>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Service Class</label>
          <select value={serviceClass} onChange={(e) => setServiceClass(e.target.value)}>
            <option value="Auto">Auto</option>
            <option value="Van">Van</option>
            <option value="Minibus">Minibus</option>
            <option value="Bus">Bus</option>
          </select>
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>License Plate</label>
          <input
            type="text"
            value={licensePlate}
            onChange={(e) => setLicensePlate(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>Capacity</label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}
        <button type="submit" style={{ marginTop: '10px' }}>Create Vehicle</button>
      </form>
    </div>
  );
};

export default CreateVehicleForm;
