import React, { useState } from 'react';
import api from '../services/api';

const ServiceRequestForm = ({ onServiceRequestCreated }) => {
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [requestedDatetime, setRequestedDatetime] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!startLocation || !endLocation || !requestedDatetime) {
      setError('All fields are required.');
      return;
    }

    try {
      const requestData = {
        start_location: startLocation,
        end_location: endLocation,
        requested_datetime: requestedDatetime,
      };
      await api.post('/requests/', requestData);

      setStartLocation('');
      setEndLocation('');
      setRequestedDatetime('');
      setSuccess('Service request submitted successfully!');

      if (onServiceRequestCreated) {
        onServiceRequestCreated();
      }

    } catch (err) {
      setError('Failed to submit request.');
      console.error(err);
    }
  };

  return (
    <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
      <h4>Request a New Service</h4>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Start Location</label>
          <input
            type="text"
            value={startLocation}
            onChange={(e) => setStartLocation(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>End Location</label>
          <input
            type="text"
            value={endLocation}
            onChange={(e) => setEndLocation(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label>Date and Time</label>
          <input
            type="datetime-local"
            value={requestedDatetime}
            onChange={(e) => setRequestedDatetime(e.target.value)}
            required
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {success && <p style={{ color: 'green' }}>{success}</p>}
        <button type="submit" style={{ marginTop: '10px' }}>Submit Request</button>
      </form>
    </div>
  );
};

export default ServiceRequestForm;
