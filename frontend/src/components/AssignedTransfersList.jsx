import React, { useState, useEffect } from 'react';
import api from '../services/api';

const AssignedTransfersList = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTransfers = async () => {
      try {
        const response = await api.get('/transfers/');
        setTransfers(response.data);
      } catch (err) {
        setError('Failed to fetch assigned transfers.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransfers();
  }, []);

  if (loading) {
    return <p>Loading your assigned transfers...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>{error}</p>;
  }

  return (
    <div style={{ marginTop: '20px' }}>
      <h3>Your Assigned Transfers</h3>
      {transfers.length === 0 ? (
        <p>You have no transfers assigned to you.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Client</th>
              <th>From</th>
              <th>To</th>
              <th>Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.id}>
                <td>{transfer.id}</td>
                <td>{transfer.client}</td>
                <td>{transfer.start_location}</td>
                <td>{transfer.end_location}</td>
                <td>{new Date(transfer.scheduled_start_time).toLocaleString()}</td>
                <td>{transfer.status}</td>
                <td>
                  {/* Action buttons will go here, e.g., Start, End */}
                  <button disabled>Update</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AssignedTransfersList;
