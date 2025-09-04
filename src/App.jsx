import { useState } from 'react'
import './App.css'
import SolarMap from "./Features/solarSystem/SolarSystem";


function App() {
    const projectMap = {
        "Terra": { title: "Portfolio Web (Next.js)", slug: "portfolio-next" },
        "Terra-Luna": { title: "Blog Tech", slug: "tech-blog" },
        "Giove-Juno": { title: "Data Viz Space", slug: "space-viz" },
        "Marte-Perseverance": { title: "ML Rover", slug: "ml-rover" },
        "Voyager-1": { title: "Low-Level Systems", slug: "low-level-systems" },
        "swarm-a-sat-01": { title: "Kata - Arrays", slug: "kata-arrays" },
    };


    return (
        <div style={{ background: "#0b1020" }}>
            <SolarMap
                githubUser="il-tuo-username"
                projectMap={projectMap}
            />
        </div>
    )
}

export default App
