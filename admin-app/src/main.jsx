import '@ant-design/v5-patch-for-react-19'; // antd 5 + React 19 compatibility (official patch)
import React from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import './styles.css';
import App from './App.jsx';
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
