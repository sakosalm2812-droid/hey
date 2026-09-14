import { Orbit, Hammer, Mic, Brain } from "lucide-react";
import { motion } from "framer-motion";

import Section from "../Section/Section";
import allAgents from "../../agents/agents.js";

import styles from "./EcosystemSection.module.css";


const systems = [

{
icon:Orbit,
title:"The Cosmos",
text:"A living intelligence space where your ideas, memories, and knowledge connect."
},

{
icon:Hammer,
title:"The Forge",
text:"Create custom AI systems built around your goals."
},

{
icon:Mic,
title:"HEY Voice",
text:"Talk naturally with an intelligence that understands context."
},

{
icon:Brain,
title:`${allAgents.length} Agent Definitions`,
text:"Specialized roles that run only through configured, verified execution providers."
}

];



export default function EcosystemSection(){


return (

<Section>


<div className={styles.wrapper}>


<motion.h2

initial={{
opacity:0,
y:40
}}

whileInView={{
opacity:1,
y:0
}}

viewport={{
once:true
}}

>

One intelligence.

<br/>

Infinite possibilities.

</motion.h2>




<p className={styles.subtitle}>

HEY is not one tool.

It is an ecosystem that grows with you.

</p>




<div className={styles.system}>


<div className={styles.core}>

HEY

</div>



{systems.map((item,index)=>{


const Icon=item.icon;


return (

<motion.article

key={item.title}

className={`${styles.node} ${styles["node"+index]}`}


whileHover={{
scale:1.08,
y:-10
}}

>


<div className={styles.icon}>

<Icon size={28}/>

</div>


<h3>

{item.title}

</h3>


<p>

{item.text}

</p>


</motion.article>

)


})}



</div>


</div>


</Section>

)

}
