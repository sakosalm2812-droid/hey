import { motion } from "framer-motion";

import Section from "../Section/Section";

import styles from "./IdentitySection.module.css";


export default function IdentitySection(){

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

Not another assistant.

<br/>

An intelligence that becomes

<span>
 yours.
</span>

</motion.h2>



<motion.p

className={styles.subtitle}

initial={{
opacity:0
}}

whileInView={{
opacity:1
}}

viewport={{
once:true
}}

>

HEY learns your world.

Your ideas.

Your goals.

Your way of thinking.

</motion.p>




<div className={styles.memory}>

<div></div>

<div></div>

<div></div>

</div>



</div>


</Section>

);

}