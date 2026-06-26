import React from 'react'

import { Routes, Route, Navigate } from 'react-router-dom'
import VideoEditor from '../pages/VideoEditor.jsx'

const Routers = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/editor" />} />
      <Route path="/editor" element={<VideoEditor />} />
    </Routes>
  )
}


export default Routers