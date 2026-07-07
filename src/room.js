import * as THREE from 'three';

export class RoomBuilder {
    constructor(scene) {
        this.scene = scene;
        this.roomGroup = new THREE.Group();

        this.roomW = 3.6;
        this.roomH = 2.8;
        this.roomD = 3.6;
        this.thick = 0.04;
    }

    build() {
        this._buildFloor();
        this._buildWalls();
        this._buildCeiling();
        this._buildTrim();
        this._buildPedestal();
        this._buildLights();
        this._addDecor();

        this.scene.add(this.roomGroup);
        return this.roomGroup;
    }

    _buildFloor() {
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x2a1f14,
            roughness: 0.35,
            metalness: 0.05,
            envMapIntensity: 0.6,
        });

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(this.roomW, this.roomD),
            floorMat
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.35;
        floor.receiveShadow = true;
        this.roomGroup.add(floor);


        const glossMat = new THREE.MeshStandardMaterial({
            color: 0x1a1008,
            roughness: 0.15,
            metalness: 0.1,
            transparent: true,
            opacity: 0.15,
            envMapIntensity: 0.8,
        });
        const gloss = new THREE.Mesh(
            new THREE.PlaneGeometry(this.roomW - 0.1, this.roomD - 0.1),
            glossMat
        );
        gloss.rotation.x = -Math.PI / 2;
        gloss.position.y = -0.33;
        this.roomGroup.add(gloss);
    }

    _buildWalls() {
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xe8ddd0,
            roughness: 0.7,
            metalness: 0.0,
            envMapIntensity: 0.2,
        });

        const halfW = this.roomW / 2;
        const halfD = this.roomD / 2;
        const halfH = this.roomH / 2;
        const t = this.thick;


        const back = new THREE.Mesh(new THREE.BoxGeometry(this.roomW, this.roomH, t), wallMat);
        back.position.set(0, 0, -halfD);
        back.receiveShadow = true;
        this.roomGroup.add(back);


        const front = new THREE.Mesh(new THREE.BoxGeometry(this.roomW, this.roomH * 0.15, t), wallMat);
        front.position.set(0, -halfH + this.roomH * 0.075, halfD);
        front.receiveShadow = true;
        this.roomGroup.add(front);


        const left = new THREE.Mesh(new THREE.BoxGeometry(t, this.roomH, this.roomD), wallMat);
        left.position.set(-halfW, 0, 0);
        left.receiveShadow = true;
        this.roomGroup.add(left);


        const right = new THREE.Mesh(new THREE.BoxGeometry(t, this.roomH, this.roomD), wallMat);
        right.position.set(halfW, 0, 0);
        right.receiveShadow = true;
        this.roomGroup.add(right);

        this._addWainscoting();
    }

    _addWainscoting() {
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0xd4c9b8,
            roughness: 0.6,
            metalness: 0.0,
        });
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xb8a88a,
            roughness: 0.5,
            metalness: 0.1,
        });

        const halfW = this.roomW / 2;
        const halfD = this.roomD / 2;
        const panelH = 1.2;
        const panelStartY = -this.roomH / 2 + 0.1;


        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(this.roomW - 0.2, 0.012, 0.012),
            trimMat
        );
        rail.position.set(0, panelStartY + panelH, -halfD + this.thick + 0.002);
        this.roomGroup.add(rail);


        const numPanels = 5;
        const spacing = (this.roomW - 0.6) / numPanels;
        for (let i = 0; i <= numPanels; i++) {
            const x = -halfW + 0.3 + i * spacing;
            const divider = new THREE.Mesh(
                new THREE.BoxGeometry(0.008, panelH - 0.05, 0.008),
                trimMat
            );
            divider.position.set(x, panelStartY + panelH / 2, -halfD + this.thick + 0.001);
            this.roomGroup.add(divider);
        }
    }

    _buildCeiling() {
        const ceilMat = new THREE.MeshStandardMaterial({
            color: 0xf5f0e8,
            roughness: 0.8,
            metalness: 0.0,
        });
        const ceiling = new THREE.Mesh(
            new THREE.PlaneGeometry(this.roomW - 0.05, this.roomD - 0.05),
            ceilMat
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = this.roomH / 2;
        ceiling.receiveShadow = true;
        this.roomGroup.add(ceiling);


        const moldMat = new THREE.MeshStandardMaterial({
            color: 0xc8b898,
            roughness: 0.5,
            metalness: 0.1,
        });
        const moldPath = [
            [-this.roomW / 2 + 0.02, this.roomH / 2 - 0.02, -this.roomD / 2 + 0.02],
            [this.roomW / 2 - 0.02, this.roomH / 2 - 0.02, -this.roomD / 2 + 0.02],
            [this.roomW / 2 - 0.02, this.roomH / 2 - 0.02, this.roomD / 2 - 0.02],
            [-this.roomW / 2 + 0.02, this.roomH / 2 - 0.02, this.roomD / 2 - 0.02],
        ];
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            const p1 = moldPath[i];
            const p2 = moldPath[next];
            const midX = (p1[0] + p2[0]) / 2;
            const midZ = (p1[2] + p2[2]) / 2;
            const lenX = Math.abs(p2[0] - p1[0]) || 0.01;
            const lenZ = Math.abs(p2[2] - p1[2]) || 0.01;
            const len = Math.max(lenX, lenZ);
            const mold = new THREE.Mesh(
                new THREE.BoxGeometry(len > 0.1 ? len + 0.02 : 0.02, 0.04, len > 0.1 ? 0.02 : len + 0.02),
                moldMat
            );
            mold.position.set(midX, this.roomH / 2 - 0.02, midZ);
            mold.castShadow = true;
            this.roomGroup.add(mold);
        }
    }

    _buildTrim() {
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xb8a88a,
            roughness: 0.5,
            metalness: 0.1,
        });
        const halfW = this.roomW / 2;
        const halfD = this.roomD / 2;
        const trimH = 0.08;
        const trimY = -this.roomH / 2 + trimH / 2;


        const baseBack = new THREE.Mesh(
            new THREE.BoxGeometry(this.roomW - 0.1, trimH, 0.015),
            trimMat
        );
        baseBack.position.set(0, trimY, -halfD + this.thick + 0.005);
        this.roomGroup.add(baseBack);


        const baseSide = new THREE.Mesh(
            new THREE.BoxGeometry(0.015, trimH, this.roomD - 0.1),
            trimMat
        );
        const baseSide2 = baseSide.clone();
        baseSide.position.set(-halfW + this.thick + 0.005, trimY, 0);
        baseSide2.position.set(halfW - this.thick - 0.005, trimY, 0);
        this.roomGroup.add(baseSide);
        this.roomGroup.add(baseSide2);
    }

    _buildPedestal() {
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.25,
            metalness: 0.6,
            envMapIntensity: 0.5,
        });
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0x8a7a5a,
            roughness: 0.3,
            metalness: 0.4,
            envMapIntensity: 0.4,
        });


        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.26, 0.04, 32),
            stoneMat
        );
        base.position.set(0, -0.33 + 0.02, 0);
        base.receiveShadow = true;
        base.castShadow = true;
        this.roomGroup.add(base);


        const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.16, 0.55, 32),
            accentMat
        );
        col.position.set(0, -0.33 + 0.04 + 0.275, 0);
        col.receiveShadow = true;
        col.castShadow = true;
        this.roomGroup.add(col);


        const top = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.22, 0.04, 32),
            stoneMat
        );
        top.position.set(0, -0.33 + 0.04 + 0.55 + 0.02, 0);
        top.receiveShadow = true;
        top.castShadow = true;
        this.roomGroup.add(top);


        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.16, 0.008, 16, 32),
            new THREE.MeshStandardMaterial({
                color: 0xbba060,
                roughness: 0.2,
                metalness: 0.8,
                envMapIntensity: 0.6,
            })
        );
        ring.position.set(0, -0.33 + 0.04 + 0.15, 0);
        ring.rotation.x = Math.PI / 2;
        this.roomGroup.add(ring);

        const ring2 = ring.clone();
        ring2.position.set(0, -0.33 + 0.04 + 0.45, 0);
        this.roomGroup.add(ring2);
    }

    _buildLights() {
        const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x112233, 0.6);
        hemiLight.position.set(0, 1, 0);
        this.roomGroup.add(hemiLight);


        const mainLight = new THREE.DirectionalLight(0xffeebb, 1.8);
        mainLight.position.set(1.5, 3, 1);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.1;
        mainLight.shadow.camera.far = 6;
        mainLight.shadow.camera.left = -1.5;
        mainLight.shadow.camera.right = 1.5;
        mainLight.shadow.camera.top = 2;
        mainLight.shadow.camera.bottom = -1;
        mainLight.shadow.bias = -0.001;
        this.roomGroup.add(mainLight);


        const spot1 = new THREE.SpotLight(0xffeedd, 1.5);
        spot1.position.set(0, this.roomH / 2 - 0.05, 0);
        spot1.target.position.set(0, -0.1, 0);
        spot1.angle = 0.4;
        spot1.penumbra = 0.6;
        spot1.decay = 1;
        spot1.distance = 4;
        spot1.castShadow = false;
        this.roomGroup.add(spot1);
        this.roomGroup.add(spot1.target);


        const spot2 = new THREE.SpotLight(0xccddff, 0.6);
        spot2.position.set(0.4, this.roomH / 2 - 0.05, 0.5);
        spot2.target.position.set(0, -0.1, 0);
        spot2.angle = 0.3;
        spot2.penumbra = 0.5;
        spot2.decay = 1;
        spot2.distance = 4;
        this.roomGroup.add(spot2);
        this.roomGroup.add(spot2.target);


        const spot3 = new THREE.SpotLight(0xffddbb, 0.4);
        spot3.position.set(-0.5, this.roomH / 2 - 0.05, -0.4);
        spot3.target.position.set(0, -0.1, 0);
        spot3.angle = 0.35;
        spot3.penumbra = 0.5;
        spot3.decay = 1;
        spot3.distance = 4;
        this.roomGroup.add(spot3);
        this.roomGroup.add(spot3.target);

        this._addCeilingLights();
    }

    _addCeilingLights() {
        const glowMat = new THREE.MeshStandardMaterial({
            color: 0xfff5e0,
            emissive: 0xffeedd,
            emissiveIntensity: 0.5,
            roughness: 0.3,
            metalness: 0.1,
        });
        const positions = [
            [0, this.roomH / 2 - 0.01, 0],
            [0.4, this.roomH / 2 - 0.01, 0.5],
            [-0.5, this.roomH / 2 - 0.01, -0.4],
        ];
        for (const pos of positions) {
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(0.025, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
                glowMat
            );
            dome.position.set(pos[0], pos[1], pos[2]);
            dome.scale.set(1, 1, 1);
            this.roomGroup.add(dome);


            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.035, 0.003, 8, 24),
                new THREE.MeshStandardMaterial({
                    color: 0xccbbaa,
                    roughness: 0.4,
                    metalness: 0.3,
                })
            );
            ring.position.set(pos[0], pos[1] - 0.002, pos[2]);
            ring.rotation.x = Math.PI / 2;
            this.roomGroup.add(ring);
        }
    }

    _addDecor() {
        const rugMat = new THREE.MeshStandardMaterial({
            color: 0x4a3a2a,
            roughness: 0.95,
            metalness: 0.0,
        });
        const rug = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 32),
            rugMat
        );
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(0, -0.33 + 0.001, 0);
        rug.receiveShadow = true;
        this.roomGroup.add(rug);


        const borderMat = new THREE.MeshStandardMaterial({
            color: 0x6a5a4a,
            roughness: 0.9,
            metalness: 0.0,
        });
        const border = new THREE.Mesh(
            new THREE.RingGeometry(0.35, 0.38, 32),
            borderMat
        );
        border.rotation.x = -Math.PI / 2;
        border.position.set(0, -0.33 + 0.002, 0);
        this.roomGroup.add(border);

        this._addWallArt();
    }

    _addWallArt() {
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x8a7a5a,
            roughness: 0.4,
            metalness: 0.3,
        });
        const artMat = new THREE.MeshStandardMaterial({
            color: 0x5a6a7a,
            roughness: 0.8,
            metalness: 0.0,
        });

        const halfD = this.roomD / 2;
        const wallZ = -halfD + this.thick + 0.001;


        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.2, 0.008),
            frameMat
        );
        frame.position.set(0, 0.15, wallZ);
        frame.castShadow = true;
        this.roomGroup.add(frame);


        const art = new THREE.Mesh(
            new THREE.PlaneGeometry(0.26, 0.16),
            artMat
        );
        art.position.set(0, 0.15, wallZ + 0.003);
        this.roomGroup.add(art);
    }
}
