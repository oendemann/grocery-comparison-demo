import { useState, useEffect } from 'react'

function App() {

  // state variables
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('Appleton, WI');
  const [radius, setRadius] = useState(5);

  // function to trigger the search
  const handleSearch = () => {
    console.log("Searching for:", searchTerm);

    // fetch that talks to Express backend
    fetch(`http://localhost:5000/api/search?product=${searchTerm}&location=${location}&radius=${radius}`)
      .then(res => res.json())
      .then(data => setItems(data)) // updates list on the screen
      .catch(err => console.error("Connection error:", err));
  };

  return (
    // search input and button
    <>
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search  for an item (e.g. eggs)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '8px', marginRight: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button
          onClick={handleSearch}
          style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '4px', backgroundColor: '#007bff', color: 'white', border: 'none' }}
        >
          Search & Scrape
        </button>
      </div>

      <div style={{ display: 'grid', gap: '10px', fontFamily: 'sans-serif' }}>
        {items.length > 0 ? (
          items.map((item, index) => (
            <div key={index} style={{
              border: '1px solid #ccc',
              padding: '15px',
              borderRadius: '8px',
              backgroundColor: '#fff',
              color: '#000'
            }}>
              <h2 style={{ margin: '0 0 5px 0' }}>{item.itemName ?? "Product Name Missing"}</h2>
              <h3 style={{ margin: '0 0 10px 0' }}>{item.storeName ?? "Walmart"}</h3>
              <p><strong>Price:</strong> ${item.price ? `${item.price.toFixed(2)}` : "Price Unavailable"}</p>
              <p style={{ fontSize: '0.8em', color: '#666' }}>
                Last Updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "Syncing..."}
              </p>
            </div>
          ))
        ) : (
          <p>No items found. Please enter a search term and click "Search & Scrape".</p>
        )}
      </div>
    </>
  )
};
export default App;