import React, { useState, useEffect } from 'react';
import api from '../services/api';

const ServiceRequestList = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await api.get('/requests/');
        setRequests(response.data);
      } catch (err) {
        setError('Failed to fetch service requests.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  if (loading) {
    return <p>Loading your requests...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>{error}</p>;
  }

  return (
    <div style={{ marginTop: '20px' }}>
      <h3>Your Service Requests</h3>
      {requests.length === 0 ? (
        <p>You have not made any requests.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>From</th>
              <th>To</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.id}</td>
                <td>{request.start_location}</td>
                <td>{request.end_location}</td>
                <td>{new Date(request.requested_datetime).toLocaleString()}</td>
                <td>{request.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ServiceRequestList;
